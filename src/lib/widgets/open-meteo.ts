import { WidgetNetworkError } from "./errors"
import {
  OPEN_METEO_FORECAST_HOST,
  OPEN_METEO_GEO_HOST,
  type WeatherPlace,
} from "./weather-provider"
import type {
  WeatherData,
  WeatherDay,
  WeatherDetails,
  WeatherHour,
  WeatherWind,
} from "./weather-types"

const RESPONSE_LIMIT = 1024 * 1024
/**
 * Open-Meteo's best_match selects the strongest model per location, so the
 * free source keeps a full seven-day horizon worldwide. Single-model requests
 * return unsuffixed response keys.
 */
export const OPEN_METEO_MODEL = "best_match"
const BEAUFORT_LIMITS = [5, 11, 19, 28, 38, 49, 61, 74, 88, 102, 117]
const COMPASS = ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const
const COMPASS_ZH: Record<(typeof COMPASS)[number], string> = {
  n: "北风",
  ne: "东北风",
  e: "东风",
  se: "东南风",
  s: "南风",
  sw: "西南风",
  w: "西风",
  nw: "西北风",
}

function languageCode(language: string) {
  return language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function array(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function integer(value: unknown): number | null {
  const parsed = numeric(value)
  return parsed === null ? null : Math.round(parsed)
}

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : undefined
}

function beaufort(kmh: number) {
  if (kmh < 1) return 0
  const index = BEAUFORT_LIMITS.findIndex((limit) => kmh <= limit)
  return index === -1 ? 12 : index + 1
}

function compassDirection(degrees: number, language: string) {
  const index =
    Math.round((((degrees % 360) + 360) % 360) / 45) % COMPASS.length
  const direction = COMPASS[index]
  return languageCode(language) === "zh"
    ? COMPASS_ZH[direction]
    : direction.toUpperCase()
}

function clockTime(value: unknown) {
  const raw = text(value, 40)
  if (!raw) return undefined
  const match =
    raw.match(/T(\d{2}):(\d{2})/) ?? raw.match(/^(\d{1,2}):(\d{2})$/)
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : undefined
}

function windReading(
  speed: number | null,
  degrees: number | null,
  language: string
): WeatherWind | undefined {
  const result: WeatherWind = {}
  if (speed !== null) {
    result.speed = Math.round(speed)
    result.scale = beaufort(speed)
    result.unit = "km/h"
  }
  if (degrees !== null) result.direction = compassDirection(degrees, language)
  return Object.keys(result).length ? result : undefined
}

async function requestJson(url: URL, signal: AbortSignal) {
  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new WidgetNetworkError("requestFailed")
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new WidgetNetworkError(
      [403, 429].includes(response.status) ? "rateLimited" : "requestFailed"
    )
  }
  const declared = Number(response.headers.get("content-length"))
  if (declared > RESPONSE_LIMIT) {
    await response.body?.cancel()
    throw new WidgetNetworkError("responseTooLarge")
  }
  const body = await response.text()
  if (body.length > RESPONSE_LIMIT)
    throw new WidgetNetworkError("responseTooLarge")
  try {
    const parsed = JSON.parse(body) as unknown
    const result = object(parsed)
    if (!result) throw new Error("not an object")
    return result
  } catch {
    throw new WidgetNetworkError("invalidResponse")
  }
}

function forecastUrl(
  path: string,
  latitude: number,
  longitude: number,
  unit: "celsius" | "fahrenheit",
  params: Record<string, string>
) {
  const url = new URL(path, OPEN_METEO_FORECAST_HOST)
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: "auto",
    temperature_unit: unit === "fahrenheit" ? "fahrenheit" : "celsius",
    ...params,
  }).toString()
  return url
}

export async function fetchOpenMeteoWeather(
  latitude: number,
  longitude: number,
  unit: "celsius" | "fahrenheit",
  language: string,
  signal: AbortSignal
): Promise<WeatherData> {
  const data = await requestJson(
    forecastUrl("/v1/forecast", latitude, longitude, unit, {
      forecast_days: "7",
      models: OPEN_METEO_MODEL,
      current:
        "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,pressure_msl,wind_speed_10m,wind_direction_10m",
      daily:
        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset",
    }),
    signal
  )
  const current = object(data.current)
  const daily = object(data.daily)
  const temperature = numeric(current?.temperature_2m)
  if (!current || !daily || temperature === null)
    throw new WidgetNetworkError("invalidResponse")

  const dates = array(daily.time)
  const codes = array(daily.weather_code)
  const highs = array(daily.temperature_2m_max)
  const lows = array(daily.temperature_2m_min)
  const precipitation = array(daily.precipitation_sum)
  const windSpeeds = array(daily.wind_speed_10m_max)
  const windDirections = array(daily.wind_direction_10m_dominant)
  const sunrises = array(daily.sunrise)
  const sunsets = array(daily.sunset)
  if (!dates?.length) throw new WidgetNetworkError("invalidResponse")

  const forecast: WeatherDay[] = dates.flatMap((value, index) => {
    const date = text(value, 20)
    const high = numeric(highs?.[index])
    const low = numeric(lows?.[index])
    if (!date || high === null || low === null) return []
    const code = integer(codes?.[index])
    const amount = numeric(precipitation?.[index])
    const wind = windReading(
      numeric(windSpeeds?.[index]),
      numeric(windDirections?.[index]),
      language
    )
    const sunrise = clockTime(sunrises?.[index])
    const sunset = clockTime(sunsets?.[index])
    return [
      {
        date,
        high,
        low,
        code,
        ...(amount !== null ? { precipitation: { amount, unit: "mm" } } : {}),
        ...(wind ? { wind } : {}),
        ...(sunrise ? { sunrise } : {}),
        ...(sunset ? { sunset } : {}),
      },
    ]
  })
  if (!forecast.length) throw new WidgetNetworkError("invalidResponse")

  const humidity = numeric(current.relative_humidity_2m)
  const feelsLike = numeric(current.apparent_temperature)
  const pressure = numeric(current.pressure_msl)
  const amount = numeric(current.precipitation)
  const wind = windReading(
    numeric(current.wind_speed_10m),
    numeric(current.wind_direction_10m),
    language
  )
  const today = forecast[0]
  return {
    kind: "weather",
    temperature,
    code: integer(current.weather_code),
    fetchedAt: Date.now(),
    ...(feelsLike !== null ? { feelsLike } : {}),
    ...(humidity !== null ? { humidity } : {}),
    ...(pressure !== null
      ? { pressure: { value: pressure, unit: "hPa" } }
      : {}),
    ...(amount !== null ? { precipitation: { amount, unit: "mm" } } : {}),
    ...(wind ? { wind } : {}),
    ...(today?.sunrise ? { sunrise: today.sunrise } : {}),
    ...(today?.sunset ? { sunset: today.sunset } : {}),
    forecast,
  }
}

export async function fetchOpenMeteoDetails(
  latitude: number,
  longitude: number,
  unit: "celsius" | "fahrenheit",
  language: string,
  signal: AbortSignal
): Promise<WeatherDetails> {
  const data = await requestJson(
    forecastUrl("/v1/forecast", latitude, longitude, unit, {
      forecast_hours: "24",
      models: OPEN_METEO_MODEL,
      hourly:
        "temperature_2m,weather_code,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m",
    }),
    signal
  )
  const hourly = object(data.hourly)
  const times = array(hourly?.time)
  if (!hourly || !times?.length) throw new WidgetNetworkError("invalidResponse")

  const series = (name: string, model = OPEN_METEO_MODEL) =>
    array(hourly[`${name}_${model}`]) ?? array(hourly[name])
  const temperatures = series("temperature_2m")
  const codes = series("weather_code")
  const precipitation = series("precipitation")
  const probabilities = series("precipitation_probability")
  const windSpeeds = series("wind_speed_10m")
  const windDirections = series("wind_direction_10m")
  const hours: WeatherHour[] = times.flatMap((value, index) => {
    const time = text(value, 40)
    const temperature = numeric(temperatures?.[index])
    if (!time || temperature === null) return []
    const speed = numeric(windSpeeds?.[index])
    const degrees = numeric(windDirections?.[index])
    const probability = numeric(probabilities?.[index])
    return [
      {
        time,
        temperature,
        code: integer(codes?.[index]),
        precipitation: numeric(precipitation?.[index]) ?? 0,
        precipitationProbability:
          probability === null ? 0 : Math.round(probability),
        windScale: speed === null ? null : beaufort(speed),
        ...(speed !== null ? { windSpeed: Math.round(speed) } : {}),
        ...(degrees !== null
          ? { windDirection: compassDirection(degrees, language) }
          : {}),
      },
    ]
  })
  if (!hours.length) throw new WidgetNetworkError("invalidResponse")
  // The free source stays on one host; air quality is QWeather-only.
  return { hourly: hours.slice(0, 24), air: null }
}

export async function searchOpenMeteoPlaces(
  query: string,
  language: string,
  signal: AbortSignal
): Promise<WeatherPlace[]> {
  const url = new URL("/v1/search", OPEN_METEO_GEO_HOST)
  url.search = new URLSearchParams({
    name: query,
    count: "8",
    language: languageCode(language),
    format: "json",
  }).toString()
  const data = await requestJson(url, signal)
  const results = array(data.results) ?? []
  return results.flatMap((value) => {
    const place = object(value)
    const name = text(place?.name, 120)
    const latitude = numeric(place?.latitude)
    const longitude = numeric(place?.longitude)
    if (!place || !name || latitude === null || longitude === null) return []
    const id =
      typeof place.id === "string" || typeof place.id === "number"
        ? String(place.id)
        : `${name}:${latitude},${longitude}`
    const city = text(place.admin1, 120)
    const state = text(place.admin2, 120)
    const country = text(place.country, 120)
    const kind = text(place.feature_code, 20)
    return [
      {
        id,
        name,
        latitude,
        longitude,
        ...(city ? { city } : {}),
        ...(state ? { state } : {}),
        ...(country ? { country } : {}),
        ...(kind ? { kind } : {}),
      },
    ]
  })
}
