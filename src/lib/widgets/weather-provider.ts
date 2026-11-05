import type {
  RemoteWidgetItem,
  WeatherProvider,
} from "@/lib/grid/utility-types"
import { normalizeQWeatherHost, type QWeatherConfig } from "./qweather"

export type WeatherItem = Extract<RemoteWidgetItem, { kind: "weather" }>

export const OPEN_METEO_FORECAST_HOST = "https://api.open-meteo.com"
export const OPEN_METEO_GEO_HOST = "https://geocoding-api.open-meteo.com"

export type WeatherPlace = {
  id: string
  name: string
  latitude: number
  longitude: number
  city?: string
  state?: string
  country?: string
  kind?: string
}

export type WeatherConfig =
  { provider: "open-meteo" } | ({ provider: "qweather" } & QWeatherConfig)

/**
 * Items saved before the provider selector existed keep QWeather when its
 * credentials are present; otherwise they fall back to the keyless source.
 */
export function resolveWeatherProvider(
  item: WeatherItem,
  qweatherConfigured: boolean
): WeatherProvider {
  if (item.provider === "open-meteo" || item.provider === "qweather")
    return item.provider
  return qweatherConfigured ? "qweather" : "open-meteo"
}

export function weatherProviderReady(
  provider: WeatherProvider,
  qweatherConfigured: boolean
) {
  return provider === "open-meteo" || qweatherConfigured
}

export function weatherOrigin(config: WeatherConfig | null): string | null {
  if (!config) return null
  if (config.provider === "open-meteo") return OPEN_METEO_FORECAST_HOST
  try {
    return normalizeQWeatherHost(config.apiHost)
  } catch {
    return null
  }
}

/** Stable cache/effect key; credentials never enter persisted caches. */
export function weatherConfigKey(config: WeatherConfig | null) {
  if (!config) return "none"
  return config.provider === "qweather"
    ? `qweather:${config.apiHost}:${config.apiKey}`
    : "open-meteo"
}
