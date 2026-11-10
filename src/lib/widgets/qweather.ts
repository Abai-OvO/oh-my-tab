import type {
  WeatherAirQuality,
  WeatherData,
  WeatherDay,
  WeatherDetails,
  WeatherHour,
  WeatherPrecipitation,
  WeatherWind,
} from "./weather-types"
import { dateOrdinal } from "./model"

export type QWeatherConfig = { apiHost: string; apiKey: string }

/**
 * Public GeoAPI host. Dedicated QWeather API hosts serve the same data under
 * `/geo/v2`, so they can reuse their existing host permission; the legacy
 * `devapi.qweather.com` host has no `/geo` route and needs this host instead.
 */
export const QWEATHER_GEO_HOST = "https://geoapi.qweather.com"

export type QWeatherPlace = {
  id: string
  name: string
  latitude: number
  longitude: number
  city?: string
  state?: string
  country?: string
  kind?: string
}

export type QWeatherErrorCode =
  | "notConfigured"
  | "requestFailed"
  | "authFailed"
  | "quotaExceeded"
  | "rateLimited"
  | "invalidResponse"

export class QWeatherError extends Error {
  readonly code: QWeatherErrorCode
  readonly status?: number

  constructor(code: QWeatherErrorCode, status?: number) {
    super(code)
    this.code = code
    this.status = status
    this.name = "QWeatherError"
  }
}

export function normalizeQWeatherHost(value: string): string {
  const raw = value.trim()
  if (!raw) throw new QWeatherError("notConfigured")
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new QWeatherError("notConfigured")
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    throw new QWeatherError("notConfigured")
  return url.origin
}

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : undefined
}

function numeric(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function languageCode(language: string) {
  return language.toLowerCase().startsWith("zh") ? "zh" : "en"
}

function codeError(code: string, status?: number): QWeatherError {
  if (code === "401" || code === "403")
    return new QWeatherError("authFailed", status)
  if (code === "402") return new QWeatherError("quotaExceeded", status)
  if (code === "429") return new QWeatherError("rateLimited", status)
  return new QWeatherError("requestFailed", status)
}

async function request(
  config: QWeatherConfig,
  path: string,
  params: Record<string, string>,
  language: string,
  signal: AbortSignal
): Promise<Record<string, unknown>> {
  const apiHost = normalizeQWeatherHost(config.apiHost)
  const apiKey = config.apiKey.trim()
  if (!apiKey) throw new QWeatherError("notConfigured")
  const url = new URL(path, apiHost)
  url.search = new URLSearchParams({
    ...params,
    lang: languageCode(language),
  }).toString()
  let response: Response
  try {
    response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      headers: { "X-QW-Api-Key": apiKey },
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      cache: "no-store",
    })
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new QWeatherError("requestFailed")
  }
  if (response.status === 401 || response.status === 403)
    throw new QWeatherError("authFailed", response.status)
  if (response.status === 429)
    throw new QWeatherError("rateLimited", response.status)
  if (!response.ok) throw new QWeatherError("requestFailed", response.status)
  let data: unknown
  try {
    data = await response.json()
  } catch {
    throw new QWeatherError("invalidResponse")
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new QWeatherError("invalidResponse")
  const record = data as Record<string, unknown>
  const code = text(record.code, 12)
  if (code && code !== "200" && code !== "204") throw codeError(code)
  return record
}

/** Resolve the host and path that serve GeoAPI for the configured API host. */
export function geoApiEndpoint(config: QWeatherConfig): {
  host: string
  path: string
} {
  try {
    const host = normalizeQWeatherHost(config.apiHost)
    if (host.endsWith(".qweatherapi.com"))
      return { host, path: "/geo/v2/city/lookup" }
  } catch {
    /* Fall back to the public GeoAPI host for an unusable configuration. */
  }
  return { host: QWEATHER_GEO_HOST, path: "/v2/city/lookup" }
}

async function geoRequest(
  config: QWeatherConfig,
  params: Record<string, string>,
  language: string,
  signal: AbortSignal
) {
  const endpoint = geoApiEndpoint(config)
  return request(
    { apiHost: endpoint.host, apiKey: config.apiKey },
    endpoint.path,
    params,
    language,
    signal
  )
}

function parsePlace(value: unknown): QWeatherPlace | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const place = value as Record<string, unknown>
  const name = text(place.name, 120)
  const id = text(place.id, 80)
  const latitude = numeric(place.lat)
  const longitude = numeric(place.lon)
  if (
    !name ||
    !id ||
    latitude === null ||
    longitude === null ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    return null
  const city = text(place.adm2, 120)
  const state = text(place.adm1, 120)
  const country = text(place.country, 120)
  const kind = text(place.type, 40)
  return {
    id,
    name,
    latitude,
    longitude,
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(country ? { country } : {}),
    ...(kind ? { kind } : {}),
  }
}

/** Keep full administrative queries useful for QWeather's GeoAPI. */
export function placeQueryVariants(query: string): string[] {
  const base = query.trim().replace(/\s+/g, " ")
  if (!base || base.length > 100) return []
  const variants = new Set([base])
  const spaced = base.replace(/([市州区县盟旗])(?=\S)/g, "$1 ").trim()
  if (spaced) variants.add(spaced)
  const district = base.match(/[市州盟]([^市州盟]+[区县旗])$/)?.[1]?.trim()
  if (district) variants.add(district)
  return [...variants].slice(0, 3)
}

export async function searchPlaces(
  query: string,
  config: QWeatherConfig,
  language: string,
  signal: AbortSignal
): Promise<QWeatherPlace[]> {
  for (const variant of placeQueryVariants(query)) {
    const data = await geoRequest(
      config,
      { location: variant, number: "6" },
      language,
      signal
    )
    const locations = data.location
    if (locations === undefined) continue
    if (!Array.isArray(locations)) throw new QWeatherError("invalidResponse")
    const seen = new Set<string>()
    const results = locations.flatMap((location) => {
      const place = parsePlace(location)
      if (!place || seen.has(place.id)) return []
      seen.add(place.id)
      return [place]
    })
    if (results.length) return results.slice(0, 6)
  }
  return []
}

export type ReversePlace = {
  city?: string
  district?: string
  state?: string
  country?: string
}

export async function reversePlace(
  latitude: number,
  longitude: number,
  config: QWeatherConfig,
  language: string,
  signal: AbortSignal
): Promise<ReversePlace | null> {
  if (
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  )
    return null
  const data = await geoRequest(
    config,
    { location: `${longitude},${latitude}`, number: "1" },
    language,
    signal
  )
  const locations = data.location
  if (!Array.isArray(locations) || !locations.length) return null
  const place = parsePlace(locations[0])
  if (!place) return null
  return {
    ...(place.city ? { city: place.city } : {}),
    ...(place.name && place.name !== place.city
      ? { district: place.name }
      : {}),
    ...(place.state ? { state: place.state } : {}),
    ...(place.country ? { country: place.country } : {}),
  }
}

function iconCode(value: unknown): number | null {
  const icon = numeric(value)
  if (icon === null) return null
  if (icon === 100 || icon === 150 || icon === 900) return 0
  if ([101, 102, 103, 151, 152, 153].includes(icon)) return 2
  if ([104, 154].includes(icon)) return 3
  if ([302, 303, 304].includes(icon)) return 95
  if (icon >= 300 && icon < 400) return 61
  if (icon >= 400 && icon < 500) return 71
  if (icon >= 200 && icon < 300) return 45
  // Haze (霾) and dust (扬沙/浮尘/沙尘暴) share the haze sentinel; fog stays 45.
  if ([501, 502, 503, 504, 507, 508, 511, 512, 513].includes(icon)) return 40
  if (icon >= 500 && icon < 600) return 45
  return null
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function temperatureReading(value: unknown) {
  const reading = object(value)
  if (!reading) return null
  const degrees = numeric(reading.value)
  if (degrees === null) return null
  return { degrees, unit: text(reading.unit, 10) }
}

function toCelsius(value: number, unit?: string) {
  return unit && /f/i.test(unit) ? ((value - 32) * 5) / 9 : value
}

function toTargetUnit(
  value: number,
  sourceUnit: string | undefined,
  target: "celsius" | "fahrenheit"
) {
  const celsius = toCelsius(value, sourceUnit)
  return target === "fahrenheit" ? (celsius * 9) / 5 + 32 : celsius
}

const COMPASS_GROUPS: Record<string, string> = {
  n: "n",
  nne: "ne",
  ne: "ne",
  ene: "ne",
  e: "e",
  ese: "se",
  se: "se",
  sse: "se",
  s: "s",
  ssw: "sw",
  sw: "sw",
  wsw: "sw",
  w: "w",
  wnw: "nw",
  nw: "nw",
  nnw: "nw",
}
const COMPASS_ZH: Record<string, string> = {
  n: "北风",
  ne: "东北风",
  e: "东风",
  se: "东南风",
  s: "南风",
  sw: "西南风",
  w: "西风",
  nw: "西北风",
}
function compassDirection(
  compass: string | undefined,
  language: string
): string | undefined {
  if (!compass) return undefined
  const group = COMPASS_GROUPS[compass.toLowerCase()] ?? compass.toLowerCase()
  return languageCode(language) === "en"
    ? group.toUpperCase()
    : COMPASS_ZH[group]
}

function clockTime(value: unknown): string | undefined {
  const raw = text(value, 60)
  if (!raw) return undefined
  const match =
    raw.match(/T(\d{2}):(\d{2})/) ?? raw.match(/^(\d{1,2}):(\d{2})$/)
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : undefined
}

function humidityPercent(value: unknown): number | undefined {
  const humidity = numeric(value)
  if (humidity === null) return undefined
  return Math.round(humidity <= 1 ? humidity * 100 : humidity)
}

function pressureReading(
  value: unknown
): { value: number; unit: string } | undefined {
  const pressure = object(value)
  if (pressure) {
    const reading = numeric(pressure.value)
    const unit = text(pressure.unit, 10) ?? "hPa"
    return reading === null ? undefined : { value: reading, unit }
  }
  const reading = numeric(value)
  return reading === null ? undefined : { value: reading, unit: "hPa" }
}

function precipitationReading(
  value: unknown
): WeatherPrecipitation | undefined {
  const precipitation = object(value)
  if (precipitation) {
    const amount = numeric(object(precipitation.amount)?.value)
    const unit = text(object(precipitation.amount)?.unit, 10) ?? "mm"
    return amount === null ? undefined : { amount, unit }
  }
  const amount = numeric(value)
  return amount === null ? undefined : { amount, unit: "mm" }
}

function windReading(
  value: unknown,
  language: string
): WeatherWind | undefined {
  const wind = object(value)
  if (!wind) return undefined
  const direction = object(wind.direction)
  const speed = object(wind.speed)
  const compass = text(direction?.compass, 15)
  const label = compassDirection(compass, language)
  const scale = numeric(wind.scale)
  const speedValue = numeric(speed?.value)
  const unit = text(speed?.unit, 10)
  const result: WeatherWind = {}
  if (label) result.direction = label
  if (scale !== null) result.scale = scale
  if (speedValue !== null) result.speed = speedValue
  if (unit) result.unit = unit
  return Object.keys(result).length ? result : undefined
}

function v7Wind(
  directionValue: unknown,
  scaleValue: unknown,
  speedValue: unknown
): WeatherWind | undefined {
  const direction = text(directionValue, 40)
  const scale = numeric(scaleValue)
  const speed = numeric(speedValue)
  const result: WeatherWind = {}
  if (direction) result.direction = direction
  if (scale !== null) result.scale = scale
  if (speed !== null) result.speed = speed
  if (speed !== null) result.unit = "km/h"
  return Object.keys(result).length ? result : undefined
}

function dailyPrecipitation(
  daytime: unknown,
  nighttime: unknown
): WeatherPrecipitation | undefined {
  let amount = 0
  let found = false
  let unit = "mm"
  for (const part of [daytime, nighttime]) {
    const precipitation = object(object(part)?.precipitation)
    if (!precipitation) continue
    const value = numeric(object(precipitation.amount)?.value)
    if (value === null) continue
    amount += value
    found = true
    unit = text(object(precipitation.amount)?.unit, 10) ?? unit
  }
  return found ? { amount, unit } : undefined
}

async function fetchV1Weather(
  latitude: number,
  longitude: number,
  unit: "celsius" | "fahrenheit",
  config: QWeatherConfig,
  language: string,
  signal: AbortSignal
): Promise<WeatherData> {
  const [nowData, dailyData] = await Promise.all([
    request(
      config,
      `/weather/v1/current/${latitude}/${longitude}`,
      { localTime: "true" },
      language,
      signal
    ),
    request(
      config,
      `/weather/v1/daily/${latitude}/${longitude}`,
      { days: "7", localTime: "true" },
      language,
      signal
    ),
  ])
  const now = object(nowData)
  const condition = object(now?.condition)
  const temperature = temperatureReading(now?.temperature)
  if (!now || !condition || !temperature)
    throw new QWeatherError("invalidResponse")
  const temperatureCode = text(condition.code, 12)
  const description = text(condition.text, 80)
  const days = dailyData.days
  if (!Array.isArray(days) || !days.length)
    throw new QWeatherError("invalidResponse")
  const forecast = days.slice(0, 7).flatMap((value) => {
    const day = object(value)
    if (!day) return []
    const daytime = object(day.daytime)
    const dayCondition = object(daytime?.condition) ?? object(day.condition)
    const start = text(day.forecastStartTime, 40)
    const date = start?.slice(0, 10)
    const high = temperatureReading(day.temperatureMax)
    const low = temperatureReading(day.temperatureMin)
    if (!date || dateOrdinal(date) === null || !high || !low) return []
    const dayCode = text(dayCondition?.code, 12)
    const dayText = text(dayCondition?.text, 80)
    const astro = object(day.astro)
    const humidity = humidityPercent(daytime?.humidity)
    const precipitation = dailyPrecipitation(daytime, day.nighttime)
    const wind = windReading(daytime?.wind, language)
    const sunrise = clockTime(astro?.sunrise)
    const sunset = clockTime(astro?.sunset)
    return [
      {
        date,
        high: toTargetUnit(high.degrees, high.unit, unit),
        low: toTargetUnit(low.degrees, low.unit, unit),
        code: iconCode(dayCode),
        ...(dayText ? { description: dayText } : {}),
        ...(humidity !== undefined ? { humidity } : {}),
        ...(precipitation ? { precipitation } : {}),
        ...(wind ? { wind } : {}),
        ...(sunrise ? { sunrise } : {}),
        ...(sunset ? { sunset } : {}),
      } satisfies WeatherDay,
    ]
  })
  if (!forecast.length) throw new QWeatherError("invalidResponse")
  const firstDay = object(days[0])
  const astro = object(firstDay?.astro)
  const feelsLike = temperatureReading(now.feelsLike)
  const humidity = humidityPercent(now.humidity)
  const pressure = pressureReading(now.pressure)
  const precipitation = precipitationReading(now.precipitation)
  const visibility = numeric(object(now.visibility)?.value)
  const wind = windReading(now.wind, language)
  const sunrise = clockTime(astro?.sunrise)
  const sunset = clockTime(astro?.sunset)
  return {
    kind: "weather",
    temperature: toTargetUnit(temperature.degrees, temperature.unit, unit),
    code: iconCode(temperatureCode),
    ...(description ? { description } : {}),
    fetchedAt: Date.now(),
    ...(feelsLike
      ? { feelsLike: toTargetUnit(feelsLike.degrees, feelsLike.unit, unit) }
      : {}),
    ...(humidity !== undefined ? { humidity } : {}),
    ...(pressure ? { pressure } : {}),
    ...(precipitation ? { precipitation } : {}),
    ...(visibility !== null ? { visibility } : {}),
    ...(wind ? { wind } : {}),
    ...(sunrise ? { sunrise } : {}),
    ...(sunset ? { sunset } : {}),
    forecast,
  }
}

async function fetchV7Weather(
  latitude: number,
  longitude: number,
  unit: "celsius" | "fahrenheit",
  config: QWeatherConfig,
  language: string,
  signal: AbortSignal
): Promise<WeatherData> {
  const [nowData, dailyData] = await Promise.all([
    request(
      config,
      "/v7/weather/now",
      { location: `${longitude},${latitude}` },
      language,
      signal
    ),
    request(
      config,
      "/v7/weather/7d",
      { location: `${longitude},${latitude}` },
      language,
      signal
    ),
  ])
  const now = nowData.now
  const daily = dailyData.daily
  if (!now || typeof now !== "object" || Array.isArray(now))
    throw new QWeatherError("invalidResponse")
  if (!Array.isArray(daily) || !daily.length || daily.length > 7)
    throw new QWeatherError("invalidResponse")
  const temperature = numeric((now as Record<string, unknown>).temp)
  if (temperature === null) throw new QWeatherError("invalidResponse")
  const forecast = daily.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return []
    const day = value as Record<string, unknown>
    const date = text(day.fxDate, 20)
    const high = numeric(day.tempMax)
    const low = numeric(day.tempMin)
    if (!date || dateOrdinal(date) === null || high === null || low === null)
      return []
    const humidity = humidityPercent(day.humidity)
    const precipitation = numeric(day.precip)
    const wind = v7Wind(day.windDirDay, day.windScaleDay, day.windSpeedDay)
    const sunrise = clockTime(day.sunrise)
    const sunset = clockTime(day.sunset)
    return [
      {
        date,
        high: toTargetUnit(high, undefined, unit),
        low: toTargetUnit(low, undefined, unit),
        code: iconCode(day.iconDay),
        ...(text(day.textDay, 80)
          ? { description: text(day.textDay, 80) }
          : {}),
        ...(humidity !== undefined ? { humidity } : {}),
        ...(precipitation !== null
          ? { precipitation: { amount: precipitation, unit: "mm" } }
          : {}),
        ...(wind ? { wind } : {}),
        ...(sunrise ? { sunrise } : {}),
        ...(sunset ? { sunset } : {}),
      } satisfies WeatherDay,
    ]
  })
  if (!forecast.length) throw new QWeatherError("invalidResponse")
  const current = now as Record<string, unknown>
  const feelsLike = numeric(current.feelsLike)
  const humidity = humidityPercent(current.humidity)
  const pressure = pressureReading(current.pressure)
  const precipitation = precipitationReading(current.precip)
  const visibility = numeric(current.vis)
  const wind = v7Wind(current.windDir, current.windScale, current.windSpeed)
  const firstDay = daily[0] as Record<string, unknown>
  const sunrise = clockTime(firstDay.sunrise)
  const sunset = clockTime(firstDay.sunset)
  return {
    kind: "weather",
    temperature: toTargetUnit(temperature, undefined, unit),
    code: iconCode(current.icon),
    ...(text(current.text, 80) ? { description: text(current.text, 80) } : {}),
    fetchedAt: Date.now(),
    ...(feelsLike !== null
      ? { feelsLike: toTargetUnit(feelsLike, undefined, unit) }
      : {}),
    ...(humidity !== undefined ? { humidity } : {}),
    ...(pressure ? { pressure } : {}),
    ...(precipitation ? { precipitation } : {}),
    ...(visibility !== null ? { visibility } : {}),
    ...(wind ? { wind } : {}),
    ...(sunrise ? { sunrise } : {}),
    ...(sunset ? { sunset } : {}),
    forecast,
  }
}

function parseAirQuality(
  data: Record<string, unknown>
): WeatherAirQuality | null {
  const indexes = data.indexes
  if (!Array.isArray(indexes) || !indexes.length) return null
  const selected =
    indexes.find((value) => text(object(value)?.code, 20) === "cn-mee") ??
    indexes[0]
  const index = object(selected)
  if (!index) return null
  const aqi = numeric(index.aqi)
  const category = text(index.category, 40)
  if (aqi === null || !category) return null
  const level = numeric(index.level)
  const health = object(index.health)
  const advice = object(health?.advice)
  const guidance =
    text(advice?.generalPopulation, 180) ?? text(health?.effect, 180)
  return {
    aqi,
    category,
    ...(level !== null ? { level } : {}),
    ...(guidance ? { advice: guidance } : {}),
  }
}

function parseHour(
  value: unknown,
  unit: "celsius" | "fahrenheit",
  language: string
): WeatherHour | null {
  const hour = object(value)
  if (!hour) return null
  const time = text(hour.forecastTime, 40)
  const temperature = temperatureReading(hour.temperature)
  if (!time || !temperature) return null
  const condition = object(hour.condition)
  const precipitation = precipitationReading(hour.precipitation)
  const probability = numeric(object(hour.precipitation)?.probability)
  const wind = object(hour.wind)
  const scale = numeric(wind?.scale)
  const speed = numeric(object(wind?.speed)?.value)
  const direction = compassDirection(
    text(object(wind?.direction)?.compass, 15),
    language
  )
  const description = text(condition?.text, 80)
  return {
    time,
    temperature: toTargetUnit(temperature.degrees, temperature.unit, unit),
    code: iconCode(text(condition?.code, 12)),
    ...(description ? { description } : {}),
    precipitation: precipitation?.amount ?? 0,
    precipitationProbability:
      probability === null
        ? 0
        : Math.round(probability <= 1 ? probability * 100 : probability),
    windScale: scale,
    ...(speed !== null ? { windSpeed: speed } : {}),
    ...(direction ? { windDirection: direction } : {}),
  }
}

export async function fetchWeatherDetails(
  latitude: number,
  longitude: number,
  unit: "celsius" | "fahrenheit",
  config: QWeatherConfig,
  language: string,
  signal: AbortSignal
): Promise<WeatherDetails> {
  const [hourlyData, airData] = await Promise.allSettled([
    request(
      config,
      `/weather/v1/hourly/${latitude}/${longitude}`,
      { hours: "24", localTime: "true" },
      language,
      signal
    ),
    request(
      config,
      `/airquality/v1/current/${latitude}/${longitude}`,
      {},
      language,
      signal
    ),
  ])
  if (hourlyData.status === "rejected") throw hourlyData.reason
  const hours = hourlyData.value.hours
  if (!Array.isArray(hours) || !hours.length)
    throw new QWeatherError("invalidResponse")
  const hourly = hours.slice(0, 24).flatMap((value) => {
    const parsed = parseHour(value, unit, language)
    return parsed ? [parsed] : []
  })
  if (!hourly.length) throw new QWeatherError("invalidResponse")
  const air =
    airData.status === "fulfilled" ? parseAirQuality(airData.value) : null
  return { hourly, air }
}

export async function fetchQWeatherWeather(
  latitude: number,
  longitude: number,
  unit: "celsius" | "fahrenheit",
  config: QWeatherConfig,
  language: string,
  signal: AbortSignal
): Promise<WeatherData> {
  try {
    return await fetchV1Weather(
      latitude,
      longitude,
      unit,
      config,
      language,
      signal
    )
  } catch (error) {
    if (
      signal.aborted ||
      !(error instanceof QWeatherError) ||
      (error.code !== "requestFailed" &&
        error.code !== "authFailed" &&
        error.code !== "invalidResponse")
    )
      throw error
    return fetchV7Weather(latitude, longitude, unit, config, language, signal)
  }
}
