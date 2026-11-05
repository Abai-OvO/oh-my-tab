import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react"
import {
  ArrowClockwise,
  CalendarBlank,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Clock,
  Drop,
  Gauge,
  Leaf,
  MapPin,
  Moon,
  SlidersHorizontal,
  Sun,
  Thermometer,
  Wind,
  X,
} from "@phosphor-icons/react"
import { useTranslation } from "react-i18next"
import { loadWeatherDetails } from "@/application/widget-network"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { RemoteWidgetItem } from "@/lib/grid/utility-types"
import {
  WidgetNetworkError,
  type WeatherData,
  type WeatherDay,
  type WeatherDetails,
  type WeatherHour,
  type WeatherPrecipitation,
  type WeatherWind,
  type WidgetNetworkErrorCode,
} from "@/lib/widgets/network"
import { calendarLabel, weatherCondition } from "@/lib/widgets/presentation"
import {
  weatherConfigKey,
  type WeatherConfig,
} from "@/lib/widgets/weather-provider"
import "./weather-popup.css"

type WeatherItem = Extract<RemoteWidgetItem, { kind: "weather" }>

type WeatherPopupProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: WeatherItem
  data: WeatherData | null
  config: WeatherConfig
  loading: boolean
  onRefresh: () => void
  onOpenSettings: () => void
}

type HourlyTab = "weather" | "rain" | "wind"
type ChartPoint = { x: number; y: number }

const CHART_WIDTH = 950
const CHART_HEIGHT = 142

function WeatherGlyph({
  code,
  size = 16,
  className,
}: {
  code: number | null
  size?: number
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
    unknown: Cloud,
  }[condition]
  return (
    <Icon
      size={size}
      weight="regular"
      className={className}
      aria-hidden="true"
    />
  )
}

function pad2(value: number) {
  return String(value).padStart(2, "0")
}

function formatUpdated(timestamp: number) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ""
  return `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(
    date.getHours()
  )}:${pad2(date.getMinutes())}`
}

function formatHourLabel(time: string, language: string) {
  const match = time.match(/T(\d{2}):/)
  const hour = match ? Number(match[1]) : new Date(time).getHours()
  if (!Number.isFinite(hour)) return ""
  return language.toLowerCase().startsWith("zh")
    ? `${hour}时`
    : `${pad2(hour)}:00`
}

function formatAmount(precipitation: WeatherPrecipitation | undefined) {
  if (!precipitation) return "—"
  const fraction = precipitation.amount % 1 === 0 ? 0 : 1
  return `${precipitation.amount.toFixed(fraction)} ${precipitation.unit}`
}

function windText(
  wind: WeatherWind | undefined,
  t: ReturnType<typeof useTranslation>["t"]
) {
  if (!wind) return ""
  const parts: string[] = []
  if (wind.direction) parts.push(wind.direction)
  if (wind.scale !== undefined)
    parts.push(t("widgets.windLevel", { level: wind.scale }))
  return parts.join(" ")
}

function dayLabel(
  day: WeatherDay,
  index: number,
  locale: string,
  t: ReturnType<typeof useTranslation>["t"]
) {
  if (index === 0) return t("widgets.today")
  return calendarLabel(day.date, locale, true)
}

function conditionText(
  description: string | undefined,
  code: number | null,
  t: ReturnType<typeof useTranslation>["t"]
) {
  return description ?? t(`widgets.conditions.${weatherCondition(code)}`)
}

function smoothPath(points: ChartPoint[]) {
  if (!points.length) return ""
  let path = `M ${points[0].x} ${points[0].y}`
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[index - 1] ?? points[index]
    const p1 = points[index]
    const p2 = points[index + 1]
    const p3 = points[index + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(
      1
    )} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return path
}

function chartX(index: number, count: number) {
  return count <= 1 ? CHART_WIDTH / 2 : (CHART_WIDTH / count) * (index + 0.5)
}

function chartY(value: number, min: number, max: number) {
  const range = max - min || 1
  return 26 + (1 - (value - min) / range) * (CHART_HEIGHT - 26 - 22)
}

function chartBounds(values: number[]) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = Math.max(1, (max - min) * 0.16)
  return { min: min - pad, max: max + pad }
}

function TemperatureChart({
  hours,
  ariaLabel,
}: {
  hours: WeatherHour[]
  ariaLabel: string
}) {
  const gradientId = useId().replaceAll(":", "")
  const values = hours.map((hour) => hour.temperature)
  const bounds = chartBounds(values)
  const points = hours.map((hour, index) => ({
    x: chartX(index, hours.length),
    y: chartY(hour.temperature, bounds.min, bounds.max),
  }))
  const line = smoothPath(points)
  const last = points[points.length - 1]
  const first = points[0]
  const area = `${line} L ${last.x} ${CHART_HEIGHT - 8} L ${first.x} ${
    CHART_HEIGHT - 8
  } Z`
  return (
    <svg
      className="weather-popup-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={ariaLabel}
    >
      <title>{ariaLabel}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            style={{ stopColor: "currentColor", stopOpacity: 0.08 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: "currentColor", stopOpacity: 0 }}
          />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} className="weather-popup-chart-line" />
      {points.map((point, index) => (
        <g key={hours[index].time}>
          <circle
            cx={point.x}
            cy={point.y}
            r="2.6"
            className="weather-popup-chart-dot"
          />
          <text
            x={point.x}
            y={point.y - 11}
            textAnchor="middle"
            className="weather-popup-chart-label"
          >
            {Math.round(hours[index].temperature)}°
          </text>
        </g>
      ))}
    </svg>
  )
}

function RainChart({
  hours,
  ariaLabel,
  noRainLabel,
}: {
  hours: WeatherHour[]
  ariaLabel: string
  noRainLabel: string
}) {
  const baseline = 112
  const wet = hours.some((hour) => hour.precipitationProbability > 0)
  return (
    <svg
      className="weather-popup-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={ariaLabel}
    >
      <title>{ariaLabel}</title>
      {hours.map((hour, index) => {
        const x = chartX(index, hours.length)
        const probability = hour.precipitationProbability
        const height = Math.max(0, (probability / 100) * 74)
        return (
          <g key={hour.time}>
            <rect
              x={x - 3}
              y="38"
              width="6"
              height={baseline - 38}
              rx="3"
              className="weather-popup-rain-track"
            />
            {probability > 0 && (
              <rect
                x={x - 3}
                y={baseline - height}
                width="6"
                height={height}
                rx="3"
                className="weather-popup-rain-bar"
              />
            )}
            <text
              x={x}
              y={CHART_HEIGHT - 8}
              textAnchor="middle"
              className="weather-popup-chart-label-muted"
            >
              {probability}%
            </text>
          </g>
        )
      })}
      <line
        x1={25}
        y1={baseline}
        x2={CHART_WIDTH - 25}
        y2={baseline}
        className="weather-popup-chart-baseline"
      />
      {!wet && (
        <text
          x={CHART_WIDTH / 2}
          y="78"
          textAnchor="middle"
          className="weather-popup-chart-empty"
        >
          {noRainLabel}
        </text>
      )}
    </svg>
  )
}

function WindChart({
  hours,
  ariaLabel,
  noWindLabel,
  windLabel,
}: {
  hours: WeatherHour[]
  ariaLabel: string
  noWindLabel: string
  windLabel: (level: number) => string
}) {
  const gradientId = useId().replaceAll(":", "")
  const scales = hours
    .map((hour) => hour.windScale)
    .filter((value): value is number => value !== null)
  if (!scales.length)
    return (
      <svg
        className="weather-popup-chart"
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
      >
        <title>{ariaLabel}</title>
        <text
          x={CHART_WIDTH / 2}
          y="74"
          textAnchor="middle"
          className="weather-popup-chart-empty"
        >
          {noWindLabel}
        </text>
      </svg>
    )
  const max = Math.max(3, ...scales)
  const points = hours.map((hour, index) => ({
    x: chartX(index, hours.length),
    y: chartY(hour.windScale ?? 0, 0, max),
  }))
  const line = smoothPath(points)
  const last = points[points.length - 1]
  const first = points[0]
  const area = `${line} L ${last.x} ${CHART_HEIGHT - 8} L ${first.x} ${
    CHART_HEIGHT - 8
  } Z`
  return (
    <svg
      className="weather-popup-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label={ariaLabel}
    >
      <title>{ariaLabel}</title>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            style={{ stopColor: "currentColor", stopOpacity: 0.07 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: "currentColor", stopOpacity: 0 }}
          />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} className="weather-popup-chart-line" />
      {points.map((point, index) => {
        const scale = hours[index].windScale
        return (
          <g key={hours[index].time}>
            <circle
              cx={point.x}
              cy={point.y}
              r="2.4"
              className="weather-popup-chart-dot"
            />
            {scale !== null && (index % 4 === 0 || scale === max) && (
              <text
                x={point.x}
                y={point.y - 10}
                textAnchor="middle"
                className="weather-popup-chart-label"
              >
                {windLabel(scale)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function useDragScroll(
  ref: RefObject<HTMLDivElement | null>,
  revision: string
) {
  const drag = useRef<{
    id: number
    startX: number
    startLeft: number
    moved: boolean
  } | null>(null)
  const suppressClick = useRef(false)

  const updateEdges = useCallback(() => {
    const element = ref.current
    if (!element) return
    const scrollable = element.scrollWidth > element.clientWidth + 1
    element.classList.toggle("is-scrollable", scrollable)
    element.classList.toggle("is-at-start", element.scrollLeft <= 1)
    element.classList.toggle(
      "is-at-end",
      element.scrollLeft + element.clientWidth >= element.scrollWidth - 1
    )
  }, [ref])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    updateEdges()
    const observer = new ResizeObserver(updateEdges)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)
    element.addEventListener("scroll", updateEdges, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener("scroll", updateEdges)
    }
  }, [ref, revision, updateEdges])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = ref.current
    if (
      !element ||
      (event.pointerType !== "mouse" && event.pointerType !== "pen") ||
      event.button !== 0 ||
      !element.classList.contains("is-scrollable")
    )
      return
    if (
      event.target instanceof Element &&
      event.target.closest("button, a, input, [role='button']")
    )
      return
    drag.current = {
      id: event.pointerId,
      startX: event.clientX,
      startLeft: element.scrollLeft,
      moved: false,
    }
    suppressClick.current = false
    element.classList.add("is-dragging")
    element.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = ref.current
    const state = drag.current
    if (!element || !state || event.pointerId !== state.id) return
    const dx = event.clientX - state.startX
    if (Math.abs(dx) > 2) {
      state.moved = true
      suppressClick.current = true
    }
    if (!state.moved) return
    event.preventDefault()
    element.scrollLeft = state.startLeft - dx
  }

  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = ref.current
    const state = drag.current
    if (!element || !state || event.pointerId !== state.id) return
    drag.current = null
    element.classList.remove("is-dragging")
    try {
      element.releasePointerCapture(event.pointerId)
    } catch {
      /* The pointer may already be released. */
    }
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return
    event.preventDefault()
    event.stopPropagation()
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
    onClickCapture,
  }
}

function DailyForecast({
  forecast,
  locale,
  t,
}: {
  forecast: WeatherDay[]
  locale: string
  t: ReturnType<typeof useTranslation>["t"]
}) {
  const highs = forecast.map((day) => day.high)
  const min = Math.min(...highs)
  const max = Math.max(...highs)
  const range = max - min || 1
  const lineY = (value: number) => 10 + (1 - (value - min) / range) * 60
  const percent = (value: number) => `${(lineY(value) / 90) * 100}%`
  const points = forecast.map((day, index) => ({
    x: ((index + 0.5) / forecast.length) * 700,
    y: lineY(day.high),
  }))
  const line = smoothPath(points)
  return (
    <div
      className="weather-popup-daily-grid"
      style={{ "--weather-days": forecast.length } as CSSProperties}
    >
      {points.length > 1 && (
        <svg
          className="weather-popup-daily-line"
          viewBox="0 0 700 90"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            opacity="0.24"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
      {forecast.map((day, index) => (
        <div
          className={`weather-popup-day${index === 0 ? "is-today" : ""}`}
          key={day.date}
          style={{ "--weather-day-y": percent(day.high) } as CSSProperties}
        >
          <div className="weather-popup-day-head">
            <span className="weather-popup-day-name">
              {dayLabel(day, index, locale, t)}
            </span>
            <span className="weather-popup-day-date">{day.date.slice(5)}</span>
            <span className="weather-popup-day-condition">
              <WeatherGlyph code={day.code} size={15} />
              <span title={conditionText(day.description, day.code, t)}>
                {conditionText(day.description, day.code, t)}
              </span>
            </span>
          </div>
          <div className="weather-popup-day-track">
            <span className="weather-popup-day-high">
              {Math.round(day.high)}°
            </span>
            <span className="weather-popup-day-dot" aria-hidden="true" />
            <span className="weather-popup-day-low">
              {Math.round(day.low)}°
            </span>
          </div>
          <div className="weather-popup-day-wind">
            <Wind size={11} aria-hidden="true" />
            {windText(day.wind, t) || "—"}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function WeatherPopup({
  open,
  onOpenChange,
  item,
  data,
  config,
  loading,
  onRefresh,
  onOpenSettings,
}: WeatherPopupProps) {
  const { t, i18n } = useTranslation()
  const configKey = weatherConfigKey(config)
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en"
  const [hourlyTab, setHourlyTab] = useState<HourlyTab>("weather")
  const [details, setDetails] = useState<WeatherDetails | null>(null)
  const [detailsError, setDetailsError] =
    useState<WidgetNetworkErrorCode | null>(null)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const detailsRequest = useRef<AbortController | null>(null)
  const dataRef = useRef(data)
  const itemRef = useRef(item)
  const configRef = useRef(config)
  const languageRef = useRef(i18n.language)
  useEffect(() => {
    dataRef.current = data
  }, [data])
  useEffect(() => {
    itemRef.current = item
  }, [item])
  useEffect(() => {
    configRef.current = config
  }, [config])
  useEffect(() => {
    languageRef.current = i18n.language
  }, [i18n.language])

  const fetchDetails = useCallback(async (useCache: boolean, clear = false) => {
    if (!dataRef.current) return
    detailsRequest.current?.abort()
    const request = new AbortController()
    detailsRequest.current = request
    if (clear) setDetails(null)
    setDetailsLoading(true)
    setDetailsError(null)
    try {
      const next = await loadWeatherDetails(
        itemRef.current,
        configRef.current,
        languageRef.current,
        request.signal,
        { useCache }
      )
      if (!request.signal.aborted) setDetails(next)
    } catch (cause) {
      if (!request.signal.aborted)
        setDetailsError(
          cause instanceof WidgetNetworkError ? cause.code : "requestFailed"
        )
    } finally {
      if (detailsRequest.current === request) {
        detailsRequest.current = null
        if (!request.signal.aborted) setDetailsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!open) {
      detailsRequest.current?.abort()
      detailsRequest.current = null
      return
    }
    const timer = window.setTimeout(() => {
      void fetchDetails(true, true)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      detailsRequest.current?.abort()
      detailsRequest.current = null
    }
  }, [
    open,
    item.id,
    item.latitude,
    item.longitude,
    item.unit,
    configKey,
    i18n.language,
    fetchDetails,
  ])

  const refresh = useCallback(() => {
    void fetchDetails(false)
    onRefresh()
  }, [fetchDetails, onRefresh])

  const hourlyScrollRef = useRef<HTMLDivElement>(null)
  const dailyScrollRef = useRef<HTMLDivElement>(null)
  const hourlyScrollHandlers = useDragScroll(
    hourlyScrollRef,
    `${details?.hourly.length ?? 0}`
  )
  const dailyScrollHandlers = useDragScroll(
    dailyScrollRef,
    `${data?.forecast.length ?? 0}`
  )
  const hourly = details?.hourly ?? []
  const air = details?.air ?? null
  const today = data?.forecast[0]
  const condition = data ? conditionText(data.description, data.code, t) : ""
  const currentWind = windText(data?.wind, t)
  const facts = data
    ? [
        {
          key: "temperature",
          icon: Thermometer,
          label: t("widgets.temperature"),
          value: today
            ? t("widgets.tempRange", {
                low: Math.round(today.low),
                high: Math.round(today.high),
              })
            : "—",
        },
        {
          key: "humidity",
          icon: Drop,
          label: t("widgets.humidity"),
          value:
            data.humidity !== undefined ? `${Math.round(data.humidity)}%` : "—",
        },
        {
          key: "pressure",
          icon: Gauge,
          label: t("widgets.pressure"),
          value: data.pressure
            ? `${Math.round(data.pressure.value)} ${data.pressure.unit}`
            : "—",
        },
        {
          key: "precipitation",
          icon: CloudRain,
          label: t("widgets.precipitation"),
          value: formatAmount(today?.precipitation ?? data.precipitation),
        },
        {
          key: "sunrise",
          icon: Sun,
          label: t("widgets.sunrise"),
          value: data.sunrise ?? today?.sunrise ?? "—",
        },
        {
          key: "sunset",
          icon: Moon,
          label: t("widgets.sunset"),
          value: data.sunset ?? today?.sunset ?? "—",
        },
      ]
    : []
  const providerError = (code: WidgetNetworkErrorCode) =>
    t(
      config.provider === "open-meteo"
        ? `widgets.openMeteoErrors.${code}`
        : `widgets.errors.${code}`
    )
  const detailHint = detailsLoading
    ? t("widgets.loading")
    : detailsError
      ? providerError(detailsError)
      : hourly.length
        ? t("widgets.nextHours", { count: hourly.length })
        : ""
  const currentRange = data?.forecast.length
    ? t("widgets.dateRange", {
        from: data.forecast[0].date.slice(5),
        to: data.forecast[data.forecast.length - 1].date.slice(5),
      })
    : ""

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/20 backdrop-blur-xl"
        className="weather-popup-dialog"
      >
        <DialogTitle className="sr-only">
          {t("widgets.detailTitle")}
        </DialogTitle>
        {data && (
          <div className="weather-popup">
            <header className="weather-popup-head">
              <div className="weather-popup-place">
                <div className="weather-popup-place-line">
                  <MapPin size={14} aria-hidden="true" />
                  <h2 className="weather-popup-location">
                    {item.locationName || item.name}
                  </h2>
                </div>
                <p className="weather-popup-updated">
                  {t("widgets.updatedAt", {
                    time: formatUpdated(data.fetchedAt),
                  })}
                </p>
              </div>
              <div className="weather-popup-actions">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("widgets.weatherSettings")}
                  title={t("widgets.weatherSettings")}
                  onClick={onOpenSettings}
                >
                  <SlidersHorizontal size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("widgets.refresh")}
                  title={t("widgets.refresh")}
                  disabled={loading || detailsLoading}
                  onClick={refresh}
                >
                  <ArrowClockwise
                    size={16}
                    className={
                      loading || detailsLoading
                        ? "weather-popup-spin"
                        : undefined
                    }
                  />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("shell.common.close")}
                  title={t("shell.common.close")}
                  onClick={() => onOpenChange(false)}
                >
                  <X size={16} />
                </Button>
              </div>
            </header>

            <div className="weather-popup-hero">
              <div>
                <div
                  className="weather-popup-temperature"
                  aria-label={t("widgets.currentTemperature", {
                    value: Math.round(data.temperature),
                  })}
                >
                  {Math.round(data.temperature)}
                  <span className="weather-popup-degree">°</span>
                </div>
                {data.feelsLike !== undefined && (
                  <div className="weather-popup-feels">
                    {t("widgets.feelsLike", {
                      value: Math.round(data.feelsLike),
                    })}
                  </div>
                )}
              </div>
              <div className="weather-popup-hero-side">
                {air && (
                  <div className="weather-popup-aqi">
                    <span
                      className="weather-popup-aqi-dot"
                      data-level={air.level ?? 1}
                      aria-hidden="true"
                    />
                    <Leaf size={12} aria-hidden="true" />
                    <span>{air.category}</span>
                    <strong>{air.aqi}</strong>
                  </div>
                )}
                <div className="weather-popup-now">
                  <WeatherGlyph code={data.code} size={17} />
                  <span>{condition}</span>
                  {currentWind && (
                    <>
                      <span
                        className="weather-popup-now-sep"
                        aria-hidden="true"
                      />
                      <span className="weather-popup-now-muted">
                        {currentWind}
                      </span>
                    </>
                  )}
                </div>
                {air?.advice && (
                  <p className="weather-popup-advice">{air.advice}</p>
                )}
              </div>
            </div>

            <div className="weather-popup-facts">
              {facts.map((fact) => {
                const Icon = fact.icon
                return (
                  <div className="weather-popup-fact" key={fact.key}>
                    <span className="weather-popup-fact-label">
                      <Icon size={12} aria-hidden="true" />
                      {fact.label}
                    </span>
                    <strong className="weather-popup-fact-value">
                      {fact.value}
                    </strong>
                  </div>
                )
              })}
            </div>

            <section
              className="weather-popup-block"
              aria-labelledby="weather-popup-hourly-title"
            >
              <div className="weather-popup-block-head">
                <div
                  className="weather-popup-block-title"
                  id="weather-popup-hourly-title"
                >
                  <Clock size={14} aria-hidden="true" />
                  <span>{t("widgets.hourly")}</span>
                  {detailHint && (
                    <span className="weather-popup-block-hint">
                      {detailHint}
                    </span>
                  )}
                </div>
                <ToggleGroup
                  className="weather-popup-tabs"
                  aria-label={t("widgets.hourlyTabs")}
                  value={[hourlyTab]}
                  onValueChange={(values) => {
                    const value = values[0]
                    if (
                      value === "weather" ||
                      value === "rain" ||
                      value === "wind"
                    )
                      setHourlyTab(value)
                  }}
                >
                  <ToggleGroupItem
                    value="weather"
                    aria-label={t("widgets.tabWeather")}
                    title={t("widgets.tabWeather")}
                  >
                    <Sun />
                    <span>{t("widgets.tabWeather")}</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="rain"
                    aria-label={t("widgets.tabRain")}
                    title={t("widgets.tabRain")}
                  >
                    <CloudRain />
                    <span>{t("widgets.tabRain")}</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="wind"
                    aria-label={t("widgets.tabWind")}
                    title={t("widgets.tabWind")}
                  >
                    <Wind />
                    <span>{t("widgets.tabWind")}</span>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              {detailsLoading && !details ? (
                <p className="weather-popup-loading">{t("widgets.loading")}</p>
              ) : detailsError && !details ? (
                <div className="weather-popup-detail-error">
                  <p>{providerError(detailsError)}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={refresh}
                  >
                    <ArrowClockwise size={13} />
                    {t("widgets.retry")}
                  </Button>
                </div>
              ) : hourly.length ? (
                <div
                  className="weather-popup-scroll weather-popup-hourly-scroll"
                  ref={hourlyScrollRef}
                  {...hourlyScrollHandlers}
                >
                  <div
                    className="weather-popup-hourly-inner"
                    style={
                      {
                        "--weather-hours": hourly.length,
                      } as CSSProperties
                    }
                  >
                    <div className="weather-popup-hour-axis" aria-hidden="true">
                      {hourly.map((hour) => (
                        <div className="weather-popup-hour" key={hour.time}>
                          <span className="weather-popup-hour-time">
                            {formatHourLabel(hour.time, i18n.language)}
                          </span>
                          <WeatherGlyph code={hour.code} size={15} />
                        </div>
                      ))}
                    </div>
                    <div className="weather-popup-chart-panel">
                      {hourlyTab === "weather" && (
                        <TemperatureChart
                          hours={hourly}
                          ariaLabel={t("widgets.hourlyTemperature")}
                        />
                      )}
                      {hourlyTab === "rain" && (
                        <RainChart
                          hours={hourly}
                          ariaLabel={t("widgets.hourlyRain")}
                          noRainLabel={t("widgets.noRain", {
                            count: hourly.length,
                          })}
                        />
                      )}
                      {hourlyTab === "wind" && (
                        <WindChart
                          hours={hourly}
                          ariaLabel={t("widgets.hourlyWind")}
                          noWindLabel={t("widgets.noWind")}
                          windLabel={(level) =>
                            t("widgets.windLevelShort", { level })
                          }
                        />
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </section>

            {data.forecast.length > 0 && (
              <section
                className="weather-popup-block"
                aria-labelledby="weather-popup-daily-title"
              >
                <div className="weather-popup-block-head">
                  <div
                    className="weather-popup-block-title"
                    id="weather-popup-daily-title"
                  >
                    <CalendarBlank size={14} aria-hidden="true" />
                    <span>{t("widgets.forecast7")}</span>
                  </div>
                  {currentRange && (
                    <span className="weather-popup-block-hint">
                      {currentRange}
                    </span>
                  )}
                </div>
                <div
                  className="weather-popup-scroll weather-popup-day-scroll"
                  ref={dailyScrollRef}
                  {...dailyScrollHandlers}
                >
                  <DailyForecast
                    forecast={data.forecast}
                    locale={locale}
                    t={t}
                  />
                </div>
              </section>
            )}

            <p className="weather-popup-attribution">
              {t("widgets.weatherBy")}{" "}
              {config.provider === "open-meteo" ? (
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open-Meteo.com
                </a>
              ) : (
                <a
                  href="https://www.qweather.com/"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("widgets.weatherSourceQWeather")}
                </a>
              )}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
