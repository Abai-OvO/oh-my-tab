import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import WeatherPopup from "./weather-popup"
import {
  ArrowClockwise,
  ArrowUpRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Key,
  MapPin,
  Rss,
  Sun,
  Thermometer,
  X,
} from "@phosphor-icons/react"
import { useTranslation } from "react-i18next"
import { loadRemoteWidget } from "@/application/widget-network"
import { Button } from "@/components/ui/button"
import type { RemoteWidgetItem } from "@/lib/grid/utility-types"
import {
  widgetRequestUrl,
  WidgetNetworkError,
  type RemoteWidgetData,
  type WeatherData,
  type WidgetNetworkErrorCode,
} from "@/lib/widgets/network"
import {
  calendarLabel,
  sourceHost,
  weatherCondition,
} from "@/lib/widgets/presentation"
import { hasWidgetOrigin } from "@/stores/privacy-store"
import { normalizeQWeatherHost } from "@/lib/widgets/qweather"
import {
  OPEN_METEO_FORECAST_HOST,
  resolveWeatherProvider,
  weatherProviderReady,
  type WeatherConfig,
} from "@/lib/widgets/weather-provider"
import { useWeatherStore } from "@/stores/weather-store"
import {
  CollectionGrid,
  CollectionRow,
  CollectionViewport,
} from "../collection/layout"
import {
  WidgetAction,
  WidgetEmpty,
  WidgetSurface,
  type WidgetProps,
} from "./surface"

function WeatherGlyph({
  code,
  className = "utility-weather-glyph",
}: {
  code: number | null
  className?: string
}) {
  const condition = weatherCondition(code)
  const Icon = {
    clear: Sun,
    cloudy: CloudSun,
    fog: CloudFog,
    thunder: CloudLightning,
    snow: CloudSnow,
    rain: CloudRain,
    unknown: Thermometer,
  }[condition]
  return (
    <Icon size={64} weight="light" className={className} aria-hidden="true" />
  )
}

const sampleCodes = [0, 1, 2, 61, 3, 71, 0]

function sampleWeather(fahrenheit: boolean): WeatherData {
  const highs = [24, 23, 25, 20, 22, 19, 21]
  const lows = [18, 17, 19, 15, 16, 13, 14]
  return {
    kind: "weather",
    temperature: fahrenheit ? 72 : 22,
    code: 0,
    fetchedAt: Date.now(),
    forecast: highs.map((high, index) => ({
      date: `2026-01-${String(15 + index).padStart(2, "0")}`,
      high: fahrenheit ? Math.round((high * 9) / 5 + 32) : high,
      low: fahrenheit ? Math.round((lows[index] * 9) / 5 + 32) : lows[index],
      code: sampleCodes[index] ?? 0,
    })),
  }
}

function WeatherDays({
  days,
  limit,
  stacked = false,
}: {
  days: WeatherData["forecast"]
  limit: number
  stacked?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en"
  return (
    <div
      className={
        stacked
          ? "utility-weather-days utility-weather-days-stacked"
          : "utility-weather-days"
      }
      aria-label={t("widgets.forecast")}
    >
      {days.slice(0, limit).map((day, index) => (
        <div
          className="utility-weather-day"
          key={day.date}
          title={day.description}
        >
          <span className="utility-weather-day-label">
            {index === 0
              ? t("widgets.tomorrow")
              : calendarLabel(day.date, locale, true)}
          </span>
          <WeatherGlyph code={day.code} className="utility-weather-day-glyph" />
          <span className="utility-weather-day-temps">
            {Math.round(day.low)}~{Math.round(day.high)}
          </span>
        </div>
      ))}
    </div>
  )
}

function WeatherSummary({
  item,
  data,
}: {
  item: Extract<RemoteWidgetItem, { kind: "weather" }>
  data: WeatherData
}) {
  const { t } = useTranslation()
  const today = data.forecast[0]
  return (
    <div className="utility-weather-summary">
      <div className="utility-weather-now">
        <span className="utility-weather-location">
          {item.locationName || item.name}
        </span>
        <strong className="utility-temperature">
          {Math.round(data.temperature)}
          <span>°</span>
        </strong>
      </div>
      <div className="utility-weather-now-side">
        <span className="utility-weather-now-sky">
          <WeatherGlyph code={data.code} />
          <span className="utility-weather-condition">
            {data.description ??
              t(`widgets.conditions.${weatherCondition(data.code)}`)}
          </span>
        </span>
        {today && (
          <span className="utility-weather-range">
            {t("widgets.lowHigh", {
              low: Math.round(today.low),
              high: Math.round(today.high),
            })}
          </span>
        )}
      </div>
    </div>
  )
}

function WeatherReading({
  item,
  data,
}: {
  item: Extract<RemoteWidgetItem, { kind: "weather" }>
  data: WeatherData
}) {
  const { t } = useTranslation()
  const today = data.forecast[0]
  const future = data.forecast.slice(1)
  if (item.size === "small" || item.size === "narrow") {
    return (
      <div className="utility-weather-reading">
        <div className="utility-weather-primary">
          {item.size === "narrow" && item.locationName && (
            <span className="utility-weather-location">
              {item.locationName}
            </span>
          )}
          <strong className="utility-temperature">
            {Math.round(data.temperature)}
            <span>°</span>
          </strong>
        </div>
        <span className="utility-weather-now-sky">
          <WeatherGlyph code={data.code} />
          <span className="utility-weather-condition">
            {data.description ??
              t(`widgets.conditions.${weatherCondition(data.code)}`)}
          </span>
        </span>
      </div>
    )
  }
  if (item.size === "square") {
    return (
      <>
        <div className="utility-weather-reading">
          <div className="utility-weather-primary">
            <span className="utility-weather-location">
              {item.locationName || item.name}
            </span>
            <strong className="utility-temperature">
              {Math.round(data.temperature)}
              <span>°</span>
            </strong>
          </div>
          <span className="utility-weather-now-sky">
            <WeatherGlyph code={data.code} />
            <span className="utility-weather-condition">
              {data.description ??
                t(`widgets.conditions.${weatherCondition(data.code)}`)}
            </span>
          </span>
        </div>
        {today && (
          <span className="utility-weather-range">
            {t("widgets.lowHigh", {
              low: Math.round(today.low),
              high: Math.round(today.high),
            })}
          </span>
        )}
      </>
    )
  }
  return (
    <>
      <WeatherSummary item={item} data={data} />
      <WeatherDays
        days={future}
        limit={item.size === "tall" ? 4 : 6}
        stacked={item.size === "tall"}
      />
    </>
  )
}

export default function RemoteTile(props: WidgetProps<RemoteWidgetItem>) {
  const { item, preview, sample = preview } = props
  const { t, i18n } = useTranslation()
  const apiHost = useWeatherStore((state) => state.apiHost)
  const apiKey = useWeatherStore((state) => state.apiKey)
  const qweatherConfigured = Boolean(apiHost.trim() && apiKey.trim())
  const weatherProvider =
    item.kind === "weather"
      ? resolveWeatherProvider(item, qweatherConfigured)
      : undefined
  const weatherConfig = useMemo<WeatherConfig | null>(() => {
    if (item.kind !== "weather" || !weatherProvider) return null
    if (weatherProvider === "open-meteo") return { provider: "open-meteo" }
    if (!qweatherConfigured) return null
    return {
      provider: "qweather",
      apiHost: apiHost.trim(),
      apiKey: apiKey.trim(),
    }
  }, [apiHost, apiKey, item.kind, qweatherConfigured, weatherProvider])
  const weatherReady = weatherProvider
    ? weatherProviderReady(weatherProvider, qweatherConfigured)
    : false
  const hasWeatherLocation =
    item.kind === "weather" && item.latitude !== null && item.longitude !== null
  const [data, setData] = useState<RemoteWidgetData | null>(null)
  const [error, setError] = useState<WidgetNetworkErrorCode | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const controller = useRef<AbortController | null>(null)
  const loadingRef = useRef(false)
  useEffect(() => () => controller.current?.abort(), [])
  const source = useMemo(() => {
    if (item.kind === "weather") {
      if (weatherProvider === "open-meteo")
        return new URL(OPEN_METEO_FORECAST_HOST)
      if (!qweatherConfigured) return null
      try {
        return new URL(normalizeQWeatherHost(apiHost))
      } catch {
        return null
      }
    }
    try {
      return new URL(widgetRequestUrl(item))
    } catch {
      /* Newly added cards need a source. */
      return null
    }
  }, [apiHost, item, qweatherConfigured, weatherProvider])
  const display: RemoteWidgetData | null = sample
    ? item.kind === "weather"
      ? sampleWeather(item.unit === "fahrenheit")
      : {
          kind: "rss",
          entries: [
            {
              title: t("widgets.feedPreviewOne"),
              url: "https://example.com/journal",
            },
            {
              title: t("widgets.feedPreviewTwo"),
              url: "https://example.com/notes",
            },
            {
              title: t("widgets.design.feedPreviewThree"),
              url: "https://example.com/reading",
            },
          ],
        }
    : data

  const load = useCallback(
    async (automatic = false) => {
      if (
        preview ||
        !source ||
        loadingRef.current ||
        (item.kind === "weather" && (!weatherConfig || !hasWeatherLocation))
      )
        return
      controller.current?.abort()
      const request = new AbortController()
      controller.current = request
      loadingRef.current = true
      setLoading(true)
      setError(null)
      try {
        const next = await loadRemoteWidget(
          item,
          request.signal,
          item.kind === "weather" ? weatherConfig : null,
          i18n.language,
          { requestPermission: !automatic, useCache: automatic }
        )
        if (!request.signal.aborted) setData(next)
      } catch (cause) {
        if (!request.signal.aborted)
          setError(
            cause instanceof WidgetNetworkError ? cause.code : "requestFailed"
          )
      } finally {
        if (controller.current === request) {
          controller.current = null
          loadingRef.current = false
          if (!request.signal.aborted) setLoading(false)
        }
      }
    },
    [hasWeatherLocation, i18n.language, item, preview, source, weatherConfig]
  )
  const loadRef = useRef<(automatic?: boolean) => Promise<void>>(async () => {})
  useEffect(() => {
    loadRef.current = load
  }, [load])
  const sourceOrigin = source?.origin
  const autoLoadAttempted = useRef(false)
  useEffect(() => {
    autoLoadAttempted.current = false
  }, [apiKey, item, sourceOrigin])
  useEffect(() => {
    if (
      preview ||
      sample ||
      item.kind !== "weather" ||
      !weatherConfig ||
      !hasWeatherLocation ||
      !sourceOrigin ||
      autoLoadAttempted.current
    )
      return
    autoLoadAttempted.current = true
    let cancelled = false
    void (async () => {
      if (!(await hasWidgetOrigin(sourceOrigin)) || cancelled) return
      await loadRef.current(true)
    })()
    return () => {
      cancelled = true
    }
  }, [
    apiKey,
    hasWeatherLocation,
    item,
    preview,
    sample,
    sourceOrigin,
    weatherConfig,
  ])
  const isWeather = item.kind === "weather"
  const weatherNeedsSetup = isWeather && (!weatherReady || !source)
  const weatherNeedsLocation = isWeather && !hasWeatherLocation
  const footer = !isWeather && (source || sample) && (
    <>
      <span title={source?.origin}>{source?.hostname || "RSS / Atom"}</span>
      {preview ? (
        <span className="utility-sample-mark">
          {t("widgets.design.example")}
        </span>
      ) : loading ? (
        <WidgetAction
          label={t("widgets.design.cancelLoad")}
          onClick={() => {
            controller.current?.abort()
            controller.current = null
            loadingRef.current = false
            setLoading(false)
          }}
        >
          <X size={14} />
        </WidgetAction>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="utility-refresh"
          aria-label={t("widgets.loadFrom", { origin: source?.origin })}
          onClick={() => void load()}
        >
          <ArrowClockwise size={13} />
          {t(data ? "widgets.refresh" : "widgets.load")}
        </Button>
      )}
    </>
  )
  return (
    <>
      <WidgetSurface
        {...props}
        className={`utility-remote utility-${item.kind}`}
        title={
          item.kind === "weather" ? item.locationName || item.name : item.name
        }
        header={item.kind !== "weather"}
        footer={footer}
      >
        {!sample && weatherNeedsSetup ? (
          <WidgetEmpty
            {...props}
            icon={<Key size={30} weight="light" />}
            title={t("widgets.design.setupWeather")}
            hint={t("widgets.design.setupWeatherHint")}
          />
        ) : !sample && weatherNeedsLocation ? (
          <WidgetEmpty
            {...props}
            icon={<MapPin size={30} weight="light" />}
            title={t("widgets.design.setLocation")}
            hint={t("widgets.design.weatherHint")}
          />
        ) : !source && !sample ? (
          <WidgetEmpty
            {...props}
            icon={<Rss size={30} weight="light" />}
            title={t("widgets.design.addFeed")}
            hint={t("widgets.design.rssHint")}
          />
        ) : (
          <div className="utility-remote-content" aria-busy={loading}>
            {!display &&
              !error &&
              (preview ? (
                <div className="utility-unloaded">
                  <span aria-hidden="true">
                    {item.kind === "weather" ? (
                      <Cloud size={36} weight="light" />
                    ) : (
                      <Rss size={30} weight="light" />
                    )}
                  </span>
                  <span>{t("widgets.design.readyToLoad")}</span>
                </div>
              ) : (
                <button
                  type="button"
                  data-drag-through
                  className="utility-unloaded utility-focus"
                  disabled={loading}
                  aria-label={t("widgets.load")}
                  onClick={() => void load()}
                >
                  <span aria-hidden="true">
                    {item.kind === "weather" ? (
                      <Cloud size={36} weight="light" />
                    ) : (
                      <Rss size={30} weight="light" />
                    )}
                  </span>
                  <span role="status">
                    {t(
                      loading ? "widgets.loading" : "widgets.design.readyToLoad"
                    )}
                  </span>
                </button>
              ))}
            {!error &&
              display?.kind === "weather" &&
              item.kind === "weather" &&
              (preview || sample ? (
                <WeatherReading item={item} data={display} />
              ) : (
                <div
                  className="utility-weather-open utility-focus"
                  role="button"
                  tabIndex={0}
                  aria-label={t("widgets.openDetails")}
                  onPointerDown={(event) => {
                    if (event.button !== 0) {
                      pressStart.current = null
                      return
                    }
                    pressStart.current = {
                      x: event.clientX,
                      y: event.clientY,
                    }
                  }}
                  onPointerUp={(event) => {
                    const start = pressStart.current
                    pressStart.current = null
                    if (!start || event.button !== 0) return
                    if (
                      Math.hypot(
                        event.clientX - start.x,
                        event.clientY - start.y
                      ) < 4
                    )
                      setDetailsOpen(true)
                  }}
                  onPointerCancel={() => {
                    pressStart.current = null
                  }}
                  onPointerLeave={() => {
                    pressStart.current = null
                  }}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      setDetailsOpen(true)
                    }
                  }}
                >
                  <WeatherReading item={item} data={display} />
                </div>
              ))}
            {!error && display?.kind === "rss" && (
              <CollectionViewport label={item.name}>
                {display.entries.length === 0 ? (
                  <p className="utility-empty-hint">{t("widgets.emptyFeed")}</p>
                ) : (
                  <CollectionGrid>
                    {display.entries.map((entry, index) => {
                      const content = (
                        <>
                          <span
                            className="utility-feed-index"
                            aria-hidden="true"
                          >
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          <span className="utility-feed-copy">
                            <strong>{entry.title}</strong>
                            <span>{sourceHost(entry.url)}</span>
                          </span>
                          <ArrowUpRight
                            size={14}
                            className="utility-link-arrow"
                            aria-hidden="true"
                          />
                        </>
                      )
                      return (
                        <CollectionRow
                          key={entry.url}
                          className="utility-feed-row"
                        >
                          {preview ? (
                            <div className="utility-feed-link">{content}</div>
                          ) : (
                            <a
                              href={entry.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="utility-feed-link utility-focus"
                              title={entry.title}
                            >
                              {content}
                            </a>
                          )}
                        </CollectionRow>
                      )
                    })}
                  </CollectionGrid>
                )}
              </CollectionViewport>
            )}
            {error &&
              (preview ? (
                <p role="alert" className="utility-error">
                  {t(
                    isWeather && weatherProvider === "open-meteo"
                      ? `widgets.openMeteoErrors.${error}`
                      : `widgets.errors.${error}`
                  )}
                </p>
              ) : (
                <button
                  type="button"
                  data-drag-through
                  className="utility-error utility-focus"
                  aria-label={t("widgets.load")}
                  onClick={() => void load()}
                >
                  {t(
                    isWeather && weatherProvider === "open-meteo"
                      ? `widgets.openMeteoErrors.${error}`
                      : `widgets.errors.${error}`
                  )}
                </button>
              ))}
          </div>
        )}
      </WidgetSurface>
      {isWeather && !preview && !sample && weatherConfig && (
        <WeatherPopup
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          item={item}
          data={display?.kind === "weather" ? display : null}
          config={weatherConfig}
          loading={loading}
          onRefresh={() => void load()}
          onOpenSettings={() => {
            setDetailsOpen(false)
            window.setTimeout(props.onOpen, 0)
          }}
        />
      )}
    </>
  )
}
