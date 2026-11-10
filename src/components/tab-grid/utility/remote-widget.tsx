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
    haze: CloudFog,
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

type PixelRect = [x: number, y: number, width: number, height: number]

type PixelPart = {
  fill: string
  rects: PixelRect[]
}

/** Stepped cloud body (rows top to bottom) shared by several glyphs. */
const PIXEL_CLOUD_BODY: PixelRect[] = [
  [6, 3, 4, 1],
  [5, 4, 6, 1],
  [4, 5, 9, 1],
  [3, 6, 11, 1],
  [2, 7, 13, 2],
  [3, 9, 12, 1],
]

const PIXEL_GLYPHS: Record<string, PixelPart[]> = {
  clear: [
    {
      fill: "#ffdf60",
      rects: [
        [7, 0, 2, 2],
        [7, 14, 2, 2],
        [0, 7, 2, 2],
        [14, 7, 2, 2],
        [2, 2, 2, 2],
        [12, 2, 2, 2],
        [2, 12, 2, 2],
        [12, 12, 2, 2],
      ],
    },
    {
      fill: "#ffcf40",
      rects: [
        [6, 4, 4, 1],
        [5, 5, 6, 1],
        [4, 6, 8, 4],
        [5, 10, 6, 1],
        [6, 11, 4, 1],
      ],
    },
    {
      fill: "#fff8e0",
      rects: [[5, 6, 2, 2]],
    },
  ],
  cloudy: [
    {
      fill: "#ffcf40",
      rects: [
        [12, 1, 3, 1],
        [11, 2, 5, 2],
        [12, 4, 3, 1],
      ],
    },
    {
      fill: "#fff8e0",
      rects: [[12, 2, 1, 1]],
    },
    { fill: "#ffffff", rects: PIXEL_CLOUD_BODY },
    { fill: "#e3ecf4", rects: [[4, 10, 10, 1]] },
  ],
  fog: [
    { fill: "#f6f9fb", rects: PIXEL_CLOUD_BODY },
    { fill: "#dfe8ef", rects: [[4, 10, 10, 1]] },
    {
      fill: "rgba(255, 255, 255, 0.85)",
      rects: [[2, 11, 12, 1]],
    },
    {
      fill: "rgba(255, 255, 255, 0.55)",
      rects: [[4, 13, 9, 1]],
    },
    {
      fill: "rgba(255, 255, 255, 0.3)",
      rects: [[3, 15, 10, 1]],
    },
  ],
  haze: [
    {
      fill: "rgba(255, 223, 96, 0.6)",
      rects: [
        [12, 1, 3, 1],
        [11, 2, 5, 1],
        [11, 3, 5, 1],
        [12, 4, 3, 1],
      ],
    },
    { fill: "#d8d0c0", rects: PIXEL_CLOUD_BODY },
    { fill: "#b5ab94", rects: [[4, 10, 10, 1]] },
    {
      fill: "rgba(224, 208, 176, 0.85)",
      rects: [[2, 11, 12, 1]],
    },
    {
      fill: "rgba(224, 208, 176, 0.5)",
      rects: [[4, 13, 9, 1]],
    },
  ],
  thunder: [
    { fill: "#f4f7fa", rects: PIXEL_CLOUD_BODY },
    { fill: "#d9e3ec", rects: [[4, 10, 10, 1]] },
    {
      fill: "#ffdf60",
      rects: [
        [8, 10, 3, 2],
        [6, 12, 3, 1],
        [7, 13, 3, 2],
      ],
    },
    {
      fill: "#9fc9f0",
      rects: [
        [3, 11, 1, 2],
        [5, 12, 1, 2],
        [12, 11, 1, 2],
        [10, 12, 1, 2],
      ],
    },
  ],
  snow: [
    { fill: "#ffffff", rects: PIXEL_CLOUD_BODY },
    { fill: "#e3ecf4", rects: [[4, 10, 10, 1]] },
    {
      fill: "#eaf3ff",
      rects: [
        [4, 11, 1, 3],
        [3, 12, 3, 1],
        [9, 12, 1, 3],
        [8, 13, 3, 1],
        [13, 11, 1, 3],
        [12, 12, 3, 1],
      ],
    },
  ],
  rain: [
    { fill: "#ffffff", rects: PIXEL_CLOUD_BODY },
    { fill: "#e3ecf4", rects: [[4, 10, 10, 1]] },
    {
      fill: "#9fc9f0",
      rects: [
        [4, 11, 1, 2],
        [7, 12, 1, 2],
        [10, 11, 1, 2],
        [13, 12, 1, 2],
      ],
    },
  ],
  unknown: [
    { fill: "#ffffff", rects: PIXEL_CLOUD_BODY },
    { fill: "#e3ecf4", rects: [[4, 10, 10, 1]] },
  ],
}

const PIXEL_DECOR_CLOUD: PixelRect[] = [
  [1, 0, 3, 1],
  [0, 1, 5, 1],
  [1, 2, 3, 1],
]

const PIXEL_DECOR_SPARK: PixelRect[] = [
  [0, 0, 1, 1],
  [2, 1, 1, 1],
  [1, 2, 1, 1],
]

const PIXEL_LANDSCAPE: PixelRect[] = [
  [0, 6, 10, 6],
  [10, 3, 8, 9],
  [18, 7, 12, 5],
  [30, 4, 10, 8],
  [40, 8, 12, 4],
  [52, 5, 12, 7],
]

function PixelGlyph({
  code,
  className,
}: {
  code: number | null
  className?: string
}) {
  const parts = PIXEL_GLYPHS[weatherCondition(code)] ?? PIXEL_GLYPHS.unknown
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {parts.map((part, index) =>
        part.rects.map((rect, rectIndex) => (
          <rect
            key={`${index}-${rectIndex}`}
            x={rect[0]}
            y={rect[1]}
            width={rect[2]}
            height={rect[3]}
            fill={part.fill}
          />
        ))
      )}
    </svg>
  )
}

function PixelDecor({
  rects,
  className,
  fill,
}: {
  rects: PixelRect[]
  className: string
  fill: string
}) {
  return (
    <svg
      viewBox="0 0 5 3"
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {rects.map((rect, index) => (
        <rect
          key={index}
          x={rect[0]}
          y={rect[1]}
          width={rect[2]}
          height={rect[3]}
          fill={fill}
        />
      ))}
    </svg>
  )
}

function PixelForecastRow({
  label,
  code,
  low,
  high,
  stacked,
}: {
  label: string
  code: number | null
  low: number
  high: number
  stacked?: boolean
}) {
  return (
    <div className={stacked ? "utility-wpixel-row" : "utility-wpixel-col"}>
      <span className="utility-wpixel-day">{label}</span>
      <PixelGlyph code={code} className="utility-wpixel-day-glyph" />
      {stacked ? (
        <>
          <span className="utility-wpixel-bar" aria-hidden="true" />
          <span className="utility-wpixel-temps">
            {Math.round(low)}° {Math.round(high)}°
          </span>
        </>
      ) : (
        <span className="utility-wpixel-temps">
          {Math.round(low)}~{Math.round(high)}
        </span>
      )}
    </div>
  )
}

function WeatherPixel({
  item,
  data,
}: {
  item: Extract<RemoteWidgetItem, { kind: "weather" }>
  data: WeatherData
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language ?? "en"
  const today = data.forecast[0]
  const future = data.forecast.slice(1)
  const condition = weatherCondition(data.code)
  const conditionLabel =
    data.description ?? t(`widgets.conditions.${condition}`)
  const inlineCondition = item.size === "small" || item.size === "medium"
  const showStrip = item.size === "medium" || item.size === "large"
  const showList = item.size === "tall"
  const showMeta = item.size === "large"
  const showLandscape = item.size === "narrow" || item.size === "square"
  const shortRange =
    item.size === "square" || item.size === "tall" || item.size === "medium"
  const rangeLabel = today
    ? shortRange
      ? `${Math.round(today.low)}°~${Math.round(today.high)}°`
      : t("widgets.lowHigh", {
          low: Math.round(today.low),
          high: Math.round(today.high),
        })
    : null
  const strip = future.slice(0, item.size === "large" ? 6 : 5)
  const list = future.slice(0, 4)
  const wind = data.wind
  const meta = showMeta
    ? [
        data.feelsLike !== undefined
          ? {
              key: "feels",
              label: t("widgets.feelsLike", {
                value: Math.round(data.feelsLike),
              }),
            }
          : null,
        data.humidity !== undefined
          ? {
              key: "humidity",
              label: `${t("widgets.humidity")} ${Math.round(data.humidity)}%`,
            }
          : null,
        wind && (wind.direction || wind.scale !== undefined)
          ? {
              key: "wind",
              label: [
                wind.direction,
                wind.scale !== undefined
                  ? t("widgets.windLevel", { level: wind.scale })
                  : "",
              ]
                .filter(Boolean)
                .join(" "),
            }
          : null,
      ].filter((part): part is { key: string; label: string } => part !== null)
    : []
  return (
    <div className={`utility-wpixel utility-wpixel-${condition}`}>
      {showLandscape && (
        <svg
          className="utility-wpixel-landscape"
          viewBox="0 0 64 12"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {PIXEL_LANDSCAPE.map((rect, index) => (
            <rect
              key={index}
              x={rect[0]}
              y={rect[1]}
              width={rect[2]}
              height={rect[3]}
              fill="rgba(0, 0, 0, 0.16)"
            />
          ))}
        </svg>
      )}
      {item.size === "large" && (
        <>
          <PixelDecor
            rects={PIXEL_DECOR_CLOUD}
            fill="rgba(255, 255, 255, 0.5)"
            className="utility-wpixel-decor-a"
          />
          {condition === "clear" && (
            <PixelDecor
              rects={PIXEL_DECOR_SPARK}
              fill="rgba(255, 255, 255, 0.7)"
              className="utility-wpixel-decor-b"
            />
          )}
        </>
      )}
      <PixelGlyph code={data.code} className="utility-wpixel-sky-glyph" />
      <div className="utility-wpixel-content">
        <span className="utility-wpixel-location">
          {item.locationName || item.name}
        </span>
        <div className="utility-wpixel-temp-row">
          <strong
            className="utility-wpixel-temp"
            aria-label={t("widgets.currentTemperature", {
              value: Math.round(data.temperature),
            })}
          >
            {Math.round(data.temperature)}
            <span>°</span>
          </strong>
          {inlineCondition && (
            <span className="utility-wpixel-condition">
              {rangeLabel
                ? `${conditionLabel} · ${rangeLabel}`
                : conditionLabel}
            </span>
          )}
        </div>
        {!inlineCondition && (
          <span className="utility-wpixel-condition">
            {rangeLabel ? `${conditionLabel} · ${rangeLabel}` : conditionLabel}
          </span>
        )}
        {meta.length > 0 && (
          <div className="utility-wpixel-meta">
            {meta.map((part) => (
              <span className="utility-wpixel-chip" key={part.key}>
                {part.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {showStrip && (
        <div
          className="utility-wpixel-strip"
          aria-label={t("widgets.forecast")}
        >
          {strip.map((day, index) => (
            <PixelForecastRow
              key={day.date}
              label={
                index === 0
                  ? t("widgets.tomorrow")
                  : calendarLabel(day.date, locale, true)
              }
              code={day.code}
              low={day.low}
              high={day.high}
            />
          ))}
        </div>
      )}
      {showList && (
        <div className="utility-wpixel-list" aria-label={t("widgets.forecast")}>
          {list.map((day, index) => (
            <PixelForecastRow
              key={day.date}
              stacked
              label={
                index === 0
                  ? t("widgets.tomorrow")
                  : calendarLabel(day.date, locale, true)
              }
              code={day.code}
              low={day.low}
              high={day.high}
            />
          ))}
        </div>
      )}
      <div className="utility-wpixel-scanlines" aria-hidden="true" />
    </div>
  )
}

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
  const pixelSkin = isWeather && item.skin === "pixel"
  const weatherReading =
    isWeather && display?.kind === "weather" && item.kind === "weather" ? (
      pixelSkin ? (
        <WeatherPixel item={item} data={display} />
      ) : (
        <WeatherReading item={item} data={display} />
      )
    ) : null
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
        className={`utility-remote utility-${item.kind}${
          pixelSkin ? "utility-weather-pixel" : ""
        }`}
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
                weatherReading
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
                  {weatherReading}
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
