import type { RemoteWidgetItem } from "@/lib/grid/utility-types"
import {
  mapQWeatherError,
  readRemoteWidget,
  widgetRequestUrl,
  WidgetNetworkError,
  type WeatherDetails,
} from "@/lib/widgets/network"
import { fetchOpenMeteoDetails } from "@/lib/widgets/open-meteo"
import { fetchWeatherDetails, QWeatherError } from "@/lib/widgets/qweather"
import {
  weatherOrigin,
  type WeatherConfig,
} from "@/lib/widgets/weather-provider"
import {
  readWeatherCache,
  readWeatherDetailsCache,
  weatherCacheKey,
  weatherDetailsCacheKey,
  writeWeatherCache,
  writeWeatherDetailsCache,
} from "@/lib/widgets/weather-cache"
import { hasWidgetOrigin, requestWidgetOrigin } from "@/stores/privacy-store"

/** Invoke directly from a click so the permission request keeps user activation. */
export async function loadRemoteWidget(
  item: RemoteWidgetItem,
  signal: AbortSignal,
  config: WeatherConfig | null,
  language: string,
  options: { requestPermission?: boolean; useCache?: boolean } = {}
) {
  let origin: string
  let cacheKey: string | null = null
  if (item.kind === "weather") {
    if (
      item.latitude === null ||
      item.longitude === null ||
      !Number.isFinite(item.latitude) ||
      Math.abs(item.latitude) > 90 ||
      !Number.isFinite(item.longitude) ||
      Math.abs(item.longitude) > 180
    )
      throw new WidgetNetworkError("notConfigured")
    const resolved = weatherOrigin(config)
    if (!resolved) throw new WidgetNetworkError("notConfigured")
    origin = resolved
    cacheKey = weatherCacheKey(item, origin, language)
  } else {
    origin = new URL(widgetRequestUrl(item)).origin
  }
  if (cacheKey && options.useCache === true) {
    const cached = await readWeatherCache(cacheKey)
    if (cached) return cached
  }
  // Page-load refreshes have no user activation, so they may only read a
  // permission that is already granted; manual loads may open the prompt.
  if (options.requestPermission === false) {
    if (!(await hasWidgetOrigin(origin)))
      throw new WidgetNetworkError("permissionDenied")
  } else {
    const granted = await requestWidgetOrigin(origin)
    if (!granted) throw new WidgetNetworkError("permissionDenied")
  }
  signal.throwIfAborted()
  const data = await readRemoteWidget(item, signal, config, language)
  if (cacheKey && data.kind === "weather")
    await writeWeatherCache(cacheKey, data)
  return data
}

/** Hourly data is only fetched when the details popup opens. */
export async function loadWeatherDetails(
  item: RemoteWidgetItem,
  config: WeatherConfig | null,
  language: string,
  signal: AbortSignal,
  options: { useCache?: boolean } = {}
): Promise<WeatherDetails> {
  if (
    item.kind !== "weather" ||
    item.latitude === null ||
    item.longitude === null ||
    !Number.isFinite(item.latitude) ||
    Math.abs(item.latitude) > 90 ||
    !Number.isFinite(item.longitude) ||
    Math.abs(item.longitude) > 180
  )
    throw new WidgetNetworkError("notConfigured")
  const origin = weatherOrigin(config)
  if (!origin) throw new WidgetNetworkError("notConfigured")
  const cacheKey = weatherDetailsCacheKey(item, origin, language)
  if (options.useCache === true) {
    const cached = await readWeatherDetailsCache(cacheKey)
    if (cached) return cached
  }
  if (!(await hasWidgetOrigin(origin)))
    throw new WidgetNetworkError("permissionDenied")
  signal.throwIfAborted()
  try {
    const details =
      config?.provider === "open-meteo"
        ? await fetchOpenMeteoDetails(
            item.latitude,
            item.longitude,
            item.unit,
            language,
            signal
          )
        : await fetchWeatherDetails(
            item.latitude,
            item.longitude,
            item.unit,
            config!,
            language,
            signal
          )
    await writeWeatherDetailsCache(cacheKey, details)
    return details
  } catch (error) {
    if (error instanceof WidgetNetworkError) throw error
    if (error instanceof QWeatherError)
      throw new WidgetNetworkError(mapQWeatherError(error))
    throw error
  }
}
