import type { RemoteWidgetItem } from "@/lib/grid/utility-types"
import type { WeatherData, WeatherDetails } from "./weather-types"

/**
 * Weather data is cached across tabs so opening several new tabs does not
 * spend one weather request per tab. Credentials are never stored here.
 */
export const WEATHER_CACHE_TTL = 10 * 60 * 1000

type CacheEntry<T> = {
  savedAt: number
  data: T
}

type StorageArea = {
  get(keys: string[]): Promise<Record<string, unknown>>
  set(values: Record<string, unknown>): Promise<void>
}

// The `cache:` prefix puts these entries under Cache → Manage cleanup.
const WEATHER_PREFIX = "cache:weather:v3:"
const DETAILS_PREFIX = "cache:weather-details:v2:"
const memory = new Map<string, CacheEntry<unknown>>()

function storageArea(): StorageArea | null {
  const area = (
    globalThis as typeof globalThis & {
      chrome?: { storage?: { local?: StorageArea } }
    }
  ).chrome?.storage?.local
  return area && typeof area.get === "function" ? area : null
}

function isWeatherData(value: unknown): value is WeatherData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const data = value as Record<string, unknown>
  return (
    data.kind === "weather" &&
    typeof data.temperature === "number" &&
    Number.isFinite(data.temperature) &&
    typeof data.fetchedAt === "number" &&
    Array.isArray(data.forecast)
  )
}

function isWeatherDetails(value: unknown): value is WeatherDetails {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const details = value as Record<string, unknown>
  return (
    Array.isArray(details.hourly) &&
    (details.air === null ||
      (typeof details.air === "object" && !Array.isArray(details.air)))
  )
}

function entryData<T>(
  entry: unknown,
  now: number,
  validate: (value: unknown) => value is T
): T | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null
  const record = entry as Partial<CacheEntry<T>>
  if (
    typeof record.savedAt !== "number" ||
    now - record.savedAt > WEATHER_CACHE_TTL ||
    !validate(record.data)
  )
    return null
  return record.data
}

async function readEntry<T>(
  key: string,
  validate: (value: unknown) => value is T,
  now: number
): Promise<T | null> {
  const area = storageArea()
  if (!area) return entryData(memory.get(key), now, validate)
  try {
    const entry = (await area.get([key]))[key]
    return entryData(entry, now, validate)
  } catch {
    return null
  }
}

async function writeEntry<T>(key: string, data: T, now: number) {
  const entry: CacheEntry<T> = { savedAt: now, data }
  memory.set(key, entry)
  const area = storageArea()
  if (!area) return
  try {
    await area.set({ [key]: entry })
  } catch {
    /* A failed cache write must never block the weather card. */
  }
}

export function weatherCacheKey(
  item: Extract<RemoteWidgetItem, { kind: "weather" }>,
  origin: string,
  language: string
) {
  const locale = language.toLowerCase().startsWith("zh") ? "zh" : "en"
  return `${WEATHER_PREFIX}${origin}|${item.latitude},${item.longitude}|${item.unit}|${locale}`
}

export function weatherDetailsCacheKey(
  item: Extract<RemoteWidgetItem, { kind: "weather" }>,
  origin: string,
  language: string
) {
  return `${DETAILS_PREFIX}${weatherCacheKey(item, origin, language).slice(WEATHER_PREFIX.length)}`
}

export function readWeatherCache(key: string, now = Date.now()) {
  return readEntry(key, isWeatherData, now)
}

export function writeWeatherCache(
  key: string,
  data: WeatherData,
  now = Date.now()
) {
  return writeEntry(key, data, now)
}

export function readWeatherDetailsCache(key: string, now = Date.now()) {
  return readEntry(key, isWeatherDetails, now)
}

export function writeWeatherDetailsCache(
  key: string,
  details: WeatherDetails,
  now = Date.now()
) {
  return writeEntry(key, details, now)
}
