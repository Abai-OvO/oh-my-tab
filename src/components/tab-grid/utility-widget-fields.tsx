import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import SettingItem from "@/components/settings/shared/setting-item"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import DatePicker from "@/components/ui/date-picker"
import TimePicker from "@/components/ui/time-picker"
import { Switch } from "@/components/ui/switch"
import "./utility/editor.css"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  isUtilityWidget,
  type UtilityWidgetItem,
} from "@/lib/grid/utility-types"
import { validGridItem } from "@/lib/grid/validation"
import {
  applyUtilityConfiguration,
  localDateKey,
  MAX_WORLD_CLOCKS,
  NOTE_MAX_LENGTH,
} from "@/lib/widgets/model"
import { prepareWidgetPhoto } from "@/lib/widgets/photo"
import {
  geoApiEndpoint,
  normalizeQWeatherHost,
  QWeatherError,
  reversePlace,
  searchPlaces,
} from "@/lib/widgets/qweather"
import { searchOpenMeteoPlaces } from "@/lib/widgets/open-meteo"
import {
  reverseGeocode,
  REVERSE_GEOCODE_HOST,
} from "@/lib/widgets/reverse-geocode"
import { WidgetNetworkError } from "@/lib/widgets/network"
import {
  OPEN_METEO_FORECAST_HOST,
  OPEN_METEO_GEO_HOST,
  resolveWeatherProvider,
  type WeatherPlace,
} from "@/lib/widgets/weather-provider"
import { requestWidgetOrigin } from "@/stores/privacy-store"
import { useTabGridStore } from "@/stores/tab-grid-store"
import { updateUtilityWidget } from "@/stores/widget-actions"
import { useWeatherStore } from "@/stores/weather-store"
import { Crosshair, MagnifyingGlass, MapPin } from "@phosphor-icons/react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="utility-editor-field">
      {label}
      {children}
    </label>
  )
}

function SwitchField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="utility-editor-switch-row">
      <label htmlFor={id}>{label}</label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="data-checked:bg-foreground [&_[data-slot=switch-thumb]]:bg-background"
      />
    </div>
  )
}

function ChoiceField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  const id = useId()
  return (
    <div className="utility-editor-field">
      <label htmlFor={id}>{label}</label>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(String(next))
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue>
            {options.find((option) => option.value === value)?.label}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** null = empty, undefined = invalid, otherwise the parsed coordinate. */
function parseLatitude(value: string): number | null | undefined {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && Math.abs(parsed) <= 90 ? parsed : undefined
}

function parseLongitude(value: string): number | null | undefined {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && Math.abs(parsed) <= 180 ? parsed : undefined
}

export default function UtilityWidgetFields({
  item,
}: {
  item: UtilityWidgetItem
}) {
  const { t, i18n } = useTranslation()
  const eventFieldId = useId()
  const durationId = useId()
  const breakDurationId = useId()
  const loopId = useId()
  const workdayId = useId()
  const clockId = useId()
  const weatherSearchId = useId()
  const apiHost = useWeatherStore((state) => state.apiHost)
  const apiKey = useWeatherStore((state) => state.apiKey)
  const setWeatherConfig = useWeatherStore((state) => state.setConfig)
  const qweatherConfigured = Boolean(apiHost.trim() && apiKey.trim())
  const [draft, setDraft] = useState<UtilityWidgetItem>(() => {
    if (item.kind === "countdown" && item.event === null)
      return { ...item, event: { title: "", date: localDateKey() } }
    if (item.kind === "weather")
      return {
        ...item,
        provider: resolveWeatherProvider(item, qweatherConfigured),
      }
    return item
  })
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [placeQuery, setPlaceQuery] = useState("")
  const [placeResults, setPlaceResults] = useState<WeatherPlace[]>([])
  const [placeSearching, setPlaceSearching] = useState(false)
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationMode, setLocationMode] = useState<"search" | "coordinates">(
    "search"
  )
  const [latitudeText, setLatitudeText] = useState(
    item.kind === "weather" && item.latitude !== null
      ? String(item.latitude)
      : ""
  )
  const [longitudeText, setLongitudeText] = useState(
    item.kind === "weather" && item.longitude !== null
      ? String(item.longitude)
      : ""
  )
  const [coordinateErrors, setCoordinateErrors] = useState<{
    latitude: string | null
    longitude: string | null
    pair: string | null
  }>({ latitude: null, longitude: null, pair: null })
  const uploadSequence = useRef(0)
  const draftRef = useRef(draft)
  const placeSearchRequest = useRef<AbortController | null>(null)
  const weatherProvider =
    draft.kind === "weather"
      ? resolveWeatherProvider(draft, qweatherConfigured)
      : undefined

  useEffect(
    () => () => {
      uploadSequence.current += 1
      placeSearchRequest.current?.abort()
    },
    []
  )

  function patch(changes: object) {
    const next = { ...draftRef.current, ...changes } as UtilityWidgetItem
    draftRef.current = next
    setDraft(next)
    save(next)
  }

  async function selectPhoto(file?: File) {
    if (!file) return
    const sequence = ++uploadSequence.current
    setUploading(true)
    setError(null)
    try {
      const image = await prepareWidgetPhoto(file)
      if (uploadSequence.current === sequence) patch({ image })
    } catch {
      if (uploadSequence.current === sequence) setError("photoInvalid")
    } finally {
      if (uploadSequence.current === sequence) setUploading(false)
    }
  }

  function currentWeatherConfig() {
    const host = normalizeQWeatherHost(apiHost)
    const key = apiKey.trim()
    if (!key) throw new QWeatherError("notConfigured")
    return { apiHost: host, apiKey: key }
  }

  async function searchLocation() {
    const query = placeQuery.trim()
    if (!query || placeSearching) return
    setPlaceSearching(true)
    setPlaceError(null)
    setPlaceResults([])
    placeSearchRequest.current?.abort()
    const controller = new AbortController()
    placeSearchRequest.current = controller
    const provider = weatherProvider ?? "open-meteo"
    try {
      let results: WeatherPlace[]
      if (provider === "qweather") {
        const config = currentWeatherConfig()
        if (!(await requestWidgetOrigin(geoApiEndpoint(config).host))) {
          setPlaceError("permissionDenied")
          return
        }
        results = await searchPlaces(
          query,
          config,
          i18n.language,
          controller.signal
        )
      } else {
        if (!(await requestWidgetOrigin(OPEN_METEO_GEO_HOST))) {
          setPlaceError("permissionDenied")
          return
        }
        results = await searchOpenMeteoPlaces(
          query,
          i18n.language,
          controller.signal
        )
      }
      if (controller.signal.aborted) return
      setPlaceResults(results)
      if (!results.length) setPlaceError("noResults")
    } catch (cause) {
      if (controller.signal.aborted) return
      setPlaceError(
        cause instanceof QWeatherError || cause instanceof WidgetNetworkError
          ? cause.code
          : "requestFailed"
      )
    } finally {
      if (placeSearchRequest.current === controller) {
        placeSearchRequest.current = null
        setPlaceSearching(false)
      }
    }
  }

  function choosePlace(place: WeatherPlace) {
    patch({
      locationName:
        place.city && place.city !== place.name
          ? `${place.city} ${place.name}`
          : place.name,
      latitude: place.latitude,
      longitude: place.longitude,
    })
    setLatitudeText(String(place.latitude))
    setLongitudeText(String(place.longitude))
    setCoordinateErrors({ latitude: null, longitude: null, pair: null })
    setPlaceQuery("")
    setPlaceResults([])
    setPlaceError(null)
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setPlaceError("geolocationUnavailable")
      return
    }
    setLocating(true)
    setPlaceError(null)
    let config: ReturnType<typeof currentWeatherConfig> | null = null
    if (weatherProvider === "qweather") {
      try {
        config = currentWeatherConfig()
      } catch {
        /* Geotagging still works without a configured weather host. */
      }
    }
    let reversePermission = false
    if (config) {
      try {
        reversePermission = await requestWidgetOrigin(
          geoApiEndpoint(config).host
        )
      } catch {
        /* Resolve coordinates without a place name if the prompt is refused. */
      }
    } else if (weatherProvider === "open-meteo") {
      try {
        reversePermission = await requestWidgetOrigin(REVERSE_GEOCODE_HOST)
      } catch {
        /* Keep "Current location" when the reverse lookup host is refused. */
      }
    }
    try {
      const status = await navigator.permissions?.query({
        name: "geolocation",
      })
      if (status?.state === "denied") {
        setPlaceError("geolocationDenied")
        setLocating(false)
        return
      }
    } catch {
      /* Continue and let geolocation report the actual result. */
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        let locationName = t("widgets.currentLocation")
        try {
          if (config && reversePermission) {
            const reverse = await reversePlace(
              latitude,
              longitude,
              config,
              i18n.language,
              AbortSignal.timeout(8000)
            )
            const label = [reverse?.city, reverse?.district]
              .filter(Boolean)
              .join(" ")
            if (label) locationName = label
          } else if (weatherProvider === "open-meteo" && reversePermission) {
            const label = await reverseGeocode(
              latitude,
              longitude,
              i18n.language,
              AbortSignal.timeout(8000)
            )
            if (label) locationName = label
          }
        } catch {
          /* Keep the generic label when reverse lookup is unavailable. */
        }
        patch({ locationName, latitude, longitude })
        setLatitudeText(String(latitude))
        setLongitudeText(String(longitude))
        setCoordinateErrors({ latitude: null, longitude: null, pair: null })
        setPlaceQuery("")
        setPlaceResults([])
        setLocationMode("coordinates")
        setLocating(false)
      },
      (cause) => {
        setPlaceError(
          cause.code === 1
            ? "geolocationDenied"
            : cause.code === 2
              ? "geolocationServiceOff"
              : "geolocationFailed"
        )
        setLocating(false)
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    )
  }

  function applyCoordinates() {
    const latitude = parseLatitude(latitudeText)
    const longitude = parseLongitude(longitudeText)
    const latitudeValid = latitude !== undefined
    const longitudeValid = longitude !== undefined
    const pairValid = (latitude === null) === (longitude === null)
    setCoordinateErrors({
      latitude: latitudeValid ? null : "range",
      longitude: longitudeValid ? null : "pair",
      pair: !latitudeValid || !longitudeValid || pairValid ? null : "pair",
    })
    if (!latitudeValid || !longitudeValid || !pairValid) return
    patch({
      latitude,
      longitude,
      ...(draft.kind === "weather" &&
      latitude !== null &&
      longitude !== null &&
      !draft.locationName.trim()
        ? { locationName: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` }
        : {}),
    })
  }

  function save(nextDraft: UtilityWidgetItem) {
    const current = useTabGridStore
      .getState()
      .items.find((entry) => entry.id === item.id)
    if (
      !current ||
      !isUtilityWidget(current) ||
      current.kind !== nextDraft.kind
    ) {
      setError("removed")
      return
    }

    let clean = {
      ...nextDraft,
      name: current.name,
      color: current.color,
      size: current.size,
      dynamicEffect: current.dynamicEffect,
    }
    if (!clean.name || clean.name.length > 40) {
      setError("invalidConfiguration")
      return
    }
    if (clean.kind === "clock")
      clean = { ...clean, timeZone: clean.timeZone.trim() }
    if (clean.kind === "rss")
      clean = { ...clean, feedUrl: clean.feedUrl.trim() }
    if (clean.kind === "countdown")
      clean = {
        ...clean,
        event: clean.event
          ? { ...clean.event, title: clean.event.title.trim() }
          : null,
      }
    if (clean.kind === "world-clock")
      clean = {
        ...clean,
        zones: clean.zones.map((zone) => ({
          ...zone,
          label: zone.label.trim(),
          timeZone: zone.timeZone.trim(),
        })),
      }

    if (clean.kind === "workday" && clean.startTime === clean.endTime) {
      setError("sameWorkTimes")
      return
    }
    if (clean.kind === "weather") {
      const provider = resolveWeatherProvider(clean, qweatherConfigured)
      clean = {
        ...clean,
        provider,
        ...(clean.latitude !== null &&
        clean.longitude !== null &&
        !clean.locationName.trim()
          ? {
              locationName: `${clean.latitude.toFixed(4)}, ${clean.longitude.toFixed(4)}`,
            }
          : {}),
      }
      const origin =
        provider === "qweather"
          ? (() => {
              try {
                return currentWeatherConfig().apiHost
              } catch {
                return null
              }
            })()
          : clean.latitude !== null && clean.longitude !== null
            ? OPEN_METEO_FORECAST_HOST
            : null
      if (origin) {
        void requestWidgetOrigin(origin).catch(() => {
          /* Saving still succeeds; the card can request access on click. */
        })
      }
    }
    const apply = (live: UtilityWidgetItem) =>
      live.kind === "note" && clean.kind === "note"
        ? { ...live, text: clean.text }
        : applyUtilityConfiguration(live, clean)
    const next = apply(current)
    if (!validGridItem(next)) {
      setError("invalidConfiguration")
      return
    }
    try {
      updateUtilityWidget(item.id, apply)
      setError(null)
    } catch {
      setError("invalidConfiguration")
    }
  }

  function fields() {
    switch (draft.kind) {
      case "clock":
        return (
          <>
            <SettingItem
              label={t("widgets.clockEffect")}
              htmlFor={`${clockId}-effect`}
            >
              <Select
                value={draft.effect}
                onValueChange={(effect) => {
                  if (effect === "plain" || effect === "dots") patch({ effect })
                }}
              >
                <SelectTrigger id={`${clockId}-effect`} className="w-full">
                  <SelectValue>
                    {t(
                      draft.effect === "dots"
                        ? "widgets.clockDots"
                        : "widgets.clockPlain"
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="plain">
                    {t("widgets.clockPlain")}
                  </SelectItem>
                  <SelectItem value="dots">{t("widgets.clockDots")}</SelectItem>
                </SelectContent>
              </Select>
            </SettingItem>
            <SettingItem
              label={t("widgets.timeZone")}
              htmlFor={`${clockId}-zone`}
              description={t("widgets.timeZoneHelp")}
            >
              <Input
                id={`${clockId}-zone`}
                value={draft.timeZone}
                maxLength={100}
                placeholder={t("widgets.deviceTimeZone")}
                onChange={(event) => patch({ timeZone: event.target.value })}
              />
            </SettingItem>
          </>
        )
      case "countdown":
        return (
          <>
            <SettingItem
              label={t("widgets.eventTitle")}
              htmlFor={`${eventFieldId}-title`}
            >
              <Input
                id={`${eventFieldId}-title`}
                required
                maxLength={40}
                value={draft.event?.title ?? ""}
                onChange={(event) =>
                  patch({
                    event: {
                      title: event.target.value,
                      date: draft.event?.date ?? localDateKey(),
                    },
                  })
                }
              />
            </SettingItem>
            <SettingItem
              label={t("widgets.date")}
              htmlFor={`${eventFieldId}-date`}
              description={t("widgets.countdownHelp")}
            >
              <DatePicker
                id={`${eventFieldId}-date`}
                value={
                  new Date(`${draft.event?.date ?? localDateKey()}T00:00:00`)
                }
                onChange={(date) =>
                  patch({
                    event: {
                      title: draft.event?.title ?? "",
                      date: localDateKey(date),
                    },
                  })
                }
              />
            </SettingItem>
          </>
        )
      case "note":
        return (
          <Field label={t("grid.component.note.label")}>
            <Textarea
              aria-label={t("grid.component.note.label")}
              value={draft.text}
              maxLength={NOTE_MAX_LENGTH}
              rows={6}
              onChange={(event) => patch({ text: event.target.value })}
            />
          </Field>
        )
      case "workday":
        return (
          <>
            <SettingItem
              label={t("widgets.workday.startTime")}
              htmlFor={`${workdayId}-start`}
            >
              <TimePicker
                id={`${workdayId}-start`}
                hourLabel={t("widgets.workday.startHour")}
                minuteLabel={t("widgets.workday.startMinute")}
                value={draft.startTime}
                onChange={(startTime) => patch({ startTime })}
              />
            </SettingItem>
            <SettingItem
              label={t("widgets.workday.endTime")}
              htmlFor={`${workdayId}-end`}
              description={t("widgets.workday.help")}
            >
              <TimePicker
                id={`${workdayId}-end`}
                hourLabel={t("widgets.workday.endHour")}
                minuteLabel={t("widgets.workday.endMinute")}
                value={draft.endTime}
                onChange={(endTime) => patch({ endTime })}
              />
            </SettingItem>
          </>
        )
      case "pomodoro":
        return (
          <>
            <SettingItem
              label={t("widgets.durationMinutes")}
              htmlFor={durationId}
              description={t("widgets.pomodoroHelp")}
            >
              <Input
                id={durationId}
                type="number"
                required
                min={1}
                max={180}
                step={1}
                value={draft.minutes}
                onChange={(event) =>
                  patch({ minutes: event.target.valueAsNumber })
                }
              />
            </SettingItem>
            <SettingItem
              label={t("widgets.breakMinutes")}
              htmlFor={breakDurationId}
              description={t("widgets.breakHelp")}
            >
              <Input
                id={breakDurationId}
                type="number"
                required
                min={0}
                max={180}
                step={1}
                value={draft.breakMinutes}
                onChange={(event) =>
                  patch({ breakMinutes: event.target.valueAsNumber })
                }
              />
            </SettingItem>
            <SettingItem
              label={t("widgets.loop")}
              htmlFor={loopId}
              description={t("widgets.loopHelp")}
            >
              <Switch
                id={loopId}
                checked={draft.loop ?? false}
                onCheckedChange={(loop) => patch({ loop })}
                className="justify-self-end data-checked:bg-foreground [&_[data-slot=switch-thumb]]:bg-background"
              />
            </SettingItem>
          </>
        )
      case "weather":
        return (
          <>
            <fieldset className="utility-editor-group">
              <legend>{t("widgets.weatherSource")}</legend>
              <ToggleGroup
                className="utility-editor-segmented"
                aria-label={t("widgets.weatherSource")}
                value={[weatherProvider ?? "open-meteo"]}
                onValueChange={(values) => {
                  const value = values[0]
                  if (value === "open-meteo" || value === "qweather")
                    patch({ provider: value })
                }}
              >
                <ToggleGroupItem value="open-meteo">
                  {t("widgets.weatherSourceFree")}
                </ToggleGroupItem>
                <ToggleGroupItem value="qweather">
                  {t("widgets.weatherSourceQWeather")}
                </ToggleGroupItem>
              </ToggleGroup>
              <p className="utility-editor-help">
                {weatherProvider === "qweather"
                  ? t("widgets.weatherSourceQWeatherHint")
                  : t("widgets.weatherSourceFreeHint")}
              </p>
            </fieldset>

            {weatherProvider === "qweather" && (
              <fieldset className="utility-editor-group">
                <legend>{t("widgets.qweatherSetup")}</legend>
                <div
                  className="utility-editor-status"
                  data-ready={qweatherConfigured || undefined}
                >
                  <span
                    className="utility-editor-status-dot"
                    aria-hidden="true"
                  />
                  {qweatherConfigured
                    ? t("widgets.qweatherConfigured")
                    : t("widgets.qweatherNotConfigured")}
                </div>
                <Field label={t("widgets.qweatherHost")}>
                  <Input
                    value={apiHost}
                    placeholder="https://xxxxxxx.re.qweatherapi.com"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) =>
                      setWeatherConfig({
                        apiHost: event.target.value,
                        apiKey,
                      })
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="justify-start"
                  onClick={() =>
                    setWeatherConfig({
                      apiHost: "https://devapi.qweather.com",
                      apiKey,
                    })
                  }
                >
                  {t("widgets.qweatherLegacyHost")}
                </Button>
                <Field label={t("widgets.qweatherKey")}>
                  <Input
                    type="password"
                    value={apiKey}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) =>
                      setWeatherConfig({
                        apiHost,
                        apiKey: event.target.value,
                      })
                    }
                  />
                </Field>
                <p className="utility-editor-help">
                  {t("widgets.qweatherHelp")}{" "}
                  <a
                    href="https://console.qweather.com/setting"
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {t("widgets.qweatherConsole")}
                  </a>
                </p>
              </fieldset>
            )}

            <fieldset className="utility-editor-group">
              <legend>{t("widgets.weatherLocation")}</legend>
              <ToggleGroup
                className="utility-editor-segmented"
                aria-label={t("widgets.locationMode")}
                value={[locationMode]}
                onValueChange={(values) => {
                  const value = values[0]
                  if (value === "search" || value === "coordinates")
                    setLocationMode(value)
                }}
              >
                <ToggleGroupItem value="search">
                  {t("widgets.locationModeSearch")}
                </ToggleGroupItem>
                <ToggleGroupItem value="coordinates">
                  {t("widgets.locationModeCoordinates")}
                </ToggleGroupItem>
              </ToggleGroup>

              {locationMode === "search" ? (
                <div className="utility-editor-field">
                  <label htmlFor={weatherSearchId}>
                    {t("widgets.locationSearch")}
                  </label>
                  <div className="utility-editor-search">
                    <Input
                      id={weatherSearchId}
                      type="search"
                      value={placeQuery}
                      placeholder={t(
                        weatherProvider === "open-meteo"
                          ? "widgets.locationSearchPlaceholderFree"
                          : "widgets.locationSearchPlaceholder"
                      )}
                      maxLength={100}
                      onChange={(event) => {
                        setPlaceQuery(event.target.value)
                        setPlaceError(null)
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key !== "Enter" ||
                          event.nativeEvent.isComposing
                        )
                          return
                        event.preventDefault()
                        void searchLocation()
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={t("widgets.searchLocation")}
                      disabled={
                        placeSearching ||
                        !placeQuery.trim() ||
                        (weatherProvider === "qweather" && !qweatherConfigured)
                      }
                      onClick={() => void searchLocation()}
                    >
                      <MagnifyingGlass />
                    </Button>
                  </div>
                  {weatherProvider === "qweather" && !qweatherConfigured && (
                    <p className="utility-editor-help">
                      {t("widgets.qweatherSearchHint")}
                    </p>
                  )}
                  {placeSearching && (
                    <p className="utility-editor-help">
                      {t("widgets.searchingPlaces")}
                    </p>
                  )}
                  {placeResults.length > 0 && (
                    <div className="utility-editor-results">
                      {placeResults.map((place) => (
                        <button
                          key={place.id}
                          type="button"
                          className="utility-editor-result"
                          onClick={() => choosePlace(place)}
                        >
                          <MapPin aria-hidden="true" />
                          <span>
                            <strong>{place.name}</strong>
                            <small>
                              {[place.city, place.state, place.country]
                                .filter(
                                  (part, index, parts) =>
                                    Boolean(part) &&
                                    parts.indexOf(part) === index
                                )
                                .join(" · ")}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {placeError && (
                    <p role="alert" className="utility-editor-error">
                      {t(
                        weatherProvider === "open-meteo"
                          ? `widgets.openMeteoPlaceErrors.${placeError}`
                          : `widgets.placeErrors.${placeError}`
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="utility-editor-coords">
                    <label htmlFor={`${weatherSearchId}-latitude`}>
                      {t("widgets.latitude")}
                      <Input
                        id={`${weatherSearchId}-latitude`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={-90}
                        max={90}
                        value={latitudeText}
                        placeholder="31.2304"
                        autoComplete="off"
                        aria-invalid={
                          coordinateErrors.latitude ? true : undefined
                        }
                        aria-describedby={
                          coordinateErrors.latitude
                            ? `${weatherSearchId}-latitude-error`
                            : undefined
                        }
                        onChange={(event) => {
                          setLatitudeText(event.target.value)
                          setCoordinateErrors((current) => ({
                            ...current,
                            latitude: null,
                            pair: null,
                          }))
                        }}
                        onBlur={applyCoordinates}
                      />
                      {coordinateErrors.latitude && (
                        <p
                          id={`${weatherSearchId}-latitude-error`}
                          role="alert"
                          className="utility-editor-error"
                        >
                          {t("widgets.coordinateRange")}
                        </p>
                      )}
                    </label>
                    <label htmlFor={`${weatherSearchId}-longitude`}>
                      {t("widgets.longitude")}
                      <Input
                        id={`${weatherSearchId}-longitude`}
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min={-180}
                        max={180}
                        value={longitudeText}
                        placeholder="121.4737"
                        autoComplete="off"
                        aria-invalid={
                          coordinateErrors.longitude ? true : undefined
                        }
                        aria-describedby={
                          coordinateErrors.longitude
                            ? `${weatherSearchId}-longitude-error`
                            : undefined
                        }
                        onChange={(event) => {
                          setLongitudeText(event.target.value)
                          setCoordinateErrors((current) => ({
                            ...current,
                            longitude: null,
                            pair: null,
                          }))
                        }}
                        onBlur={applyCoordinates}
                      />
                      {coordinateErrors.longitude && (
                        <p
                          id={`${weatherSearchId}-longitude-error`}
                          role="alert"
                          className="utility-editor-error"
                        >
                          {t("widgets.coordinateRange")}
                        </p>
                      )}
                    </label>
                  </div>
                  {coordinateErrors.pair && (
                    <p role="alert" className="utility-editor-error">
                      {t("widgets.coordinatePair")}
                    </p>
                  )}
                  <p className="utility-editor-help">
                    {t("widgets.coordinateHint")}
                  </p>
                </>
              )}

              <Button
                type="button"
                variant="outline"
                className="justify-start"
                disabled={locating}
                onClick={useCurrentLocation}
              >
                <Crosshair />
                {locating
                  ? t("widgets.locating")
                  : t("widgets.useCurrentLocation")}
              </Button>
              {draft.latitude !== null && draft.longitude !== null && (
                <div className="utility-editor-selected">
                  <MapPin aria-hidden="true" />
                  <span>
                    {draft.locationName || t("widgets.selectedLocation")}
                  </span>
                  <small>
                    {draft.latitude.toFixed(4)}, {draft.longitude.toFixed(4)}
                  </small>
                </div>
              )}
            </fieldset>

            <Field label={t("widgets.locationName")}>
              <Input
                maxLength={40}
                value={draft.locationName}
                onChange={(event) =>
                  patch({ locationName: event.target.value })
                }
              />
            </Field>
            <p className="utility-editor-help">
              {t("widgets.locationNameHelp")}
            </p>
            <ChoiceField
              label={t("widgets.temperatureUnit")}
              value={draft.unit}
              options={[
                { value: "celsius", label: "°C" },
                { value: "fahrenheit", label: "°F" },
              ]}
              onChange={(value) =>
                patch({
                  unit: value === "fahrenheit" ? "fahrenheit" : "celsius",
                })
              }
            />
            <p className="utility-editor-help">
              {weatherProvider === "qweather"
                ? t("widgets.weatherPrivacy")
                : t("widgets.openMeteoPrivacy")}
            </p>
          </>
        )
      case "photo":
        return (
          <>
            <Field label={t("widgets.photoFile")}>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading}
                onChange={(event) => {
                  void selectPhoto(event.target.files?.[0])
                  event.target.value = ""
                }}
              />
            </Field>
            <p className="utility-editor-help">
              {t(uploading ? "widgets.processingPhoto" : "widgets.photoHelp")}
            </p>
            {draft.image && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => patch({ image: "" })}
                >
                  {t("widgets.removePhoto")}
                </Button>
              </>
            )}
            <Field label={t("widgets.caption")}>
              <Input
                value={draft.caption}
                maxLength={120}
                onChange={(event) => patch({ caption: event.target.value })}
              />
            </Field>
            <ChoiceField
              label={t("widgets.photoFit")}
              value={draft.fit}
              options={[
                { value: "cover", label: t("widgets.cover") },
                { value: "contain", label: t("widgets.contain") },
              ]}
              onChange={(value) =>
                patch({ fit: value === "contain" ? "contain" : "cover" })
              }
            />
          </>
        )
      case "rss":
        return (
          <>
            <Field label={t("widgets.feedUrl")}>
              <Input
                type="url"
                maxLength={2048}
                value={draft.feedUrl}
                placeholder="https://example.com/feed.xml"
                onChange={(event) => patch({ feedUrl: event.target.value })}
              />
            </Field>
            <p className="utility-editor-help">{t("widgets.rssPrivacy")}</p>
          </>
        )
      case "world-clock":
        return (
          <>
            {draft.zones.map((zone, index) => (
              <fieldset key={zone.id} className="utility-editor-group">
                <legend className="px-1 text-xs">
                  {t("widgets.zoneIndex", { index: index + 1 })}
                </legend>
                <Field label={t("widgets.cityLabel")}>
                  <Input
                    required
                    maxLength={40}
                    value={zone.label}
                    onChange={(event) =>
                      patch({
                        zones: draft.zones.map((value) =>
                          value.id === zone.id
                            ? { ...value, label: event.target.value }
                            : value
                        ),
                      })
                    }
                  />
                </Field>
                <Field label={t("widgets.timeZone")}>
                  <Input
                    required
                    maxLength={100}
                    placeholder="Asia/Tokyo"
                    value={zone.timeZone}
                    onChange={(event) =>
                      patch({
                        zones: draft.zones.map((value) =>
                          value.id === zone.id
                            ? { ...value, timeZone: event.target.value }
                            : value
                        ),
                      })
                    }
                  />
                </Field>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={draft.zones.length === 1}
                  onClick={() =>
                    patch({
                      zones: draft.zones.filter(
                        (value) => value.id !== zone.id
                      ),
                    })
                  }
                >
                  {t("widgets.remove")}
                </Button>
              </fieldset>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={draft.zones.length >= MAX_WORLD_CLOCKS}
              onClick={() =>
                patch({
                  zones: [
                    ...draft.zones,
                    {
                      id: crypto.randomUUID(),
                      label: "UTC",
                      timeZone: "UTC",
                    },
                  ],
                })
              }
            >
              {t("widgets.addZone")}
            </Button>
            <SwitchField
              label={t("widgets.hour12")}
              checked={draft.hour12}
              onChange={(hour12) => patch({ hour12 })}
            />
            <p className="utility-editor-help">{t("widgets.timeZoneHelp")}</p>
          </>
        )
    }
  }

  return (
    <div className="utility-editor-fields">
      {fields()}
      {(item.kind === "weather" || item.kind === "rss") && (
        <p className="utility-editor-help">{t("widgets.previewOnly")}</p>
      )}
      {error && (
        <p role="status" className="utility-editor-error">
          {t(`widgets.errors.${error}`)}
        </p>
      )}
    </div>
  )
}
