import type { RemoteWidgetItem } from "@/lib/grid/utility-types"
import { remoteUrl, safeLink } from "./model"
import { fetchQWeatherWeather, QWeatherError } from "./qweather"
import { fetchOpenMeteoWeather } from "./open-meteo"
import { WidgetNetworkError, type WidgetNetworkErrorCode } from "./errors"
import type { WeatherConfig } from "./weather-provider"
import type { WeatherData } from "./weather-types"

export { WidgetNetworkError, type WidgetNetworkErrorCode } from "./errors"
export type {
  WeatherAirQuality,
  WeatherData,
  WeatherDay,
  WeatherDetails,
  WeatherHour,
  WeatherPrecipitation,
  WeatherWind,
} from "./weather-types"
export type FeedData = {
  kind: "rss"
  entries: { title: string; url: string }[]
}
export type RemoteWidgetData = WeatherData | FeedData

export function widgetRequestUrl(item: RemoteWidgetItem): string {
  switch (item.kind) {
    case "weather":
      throw new WidgetNetworkError("notConfigured")
    case "rss": {
      const url = remoteUrl(item.feedUrl)
      if (!url) throw new WidgetNetworkError("notConfigured")
      return url
    }
  }
}

export function remoteSourceKey(item: RemoteWidgetItem) {
  if (item.kind === "weather")
    return `${item.latitude ?? ""},${item.longitude ?? ""}`
  try {
    return widgetRequestUrl(item)
  } catch {
    return item.kind
  }
}

export const WIDGET_RESPONSE_LIMIT = 1024 * 1024

async function requestWidget(
  url: string,
  signal: AbortSignal,
  init: RequestInit
) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    credentials: "omit",
    referrerPolicy: "no-referrer",
    redirect: "error",
    cache: "no-store",
  })
}

async function readWidgetResponse(response: Response) {
  if (!response.ok) {
    const status = response.status
    await response.body?.cancel().catch(() => {})
    throw new WidgetNetworkError(
      status === 403 || status === 429
        ? "rateLimited"
        : status === 402
          ? "quotaExceeded"
          : "requestFailed",
      status
    )
  }
  if (Number(response.headers.get("content-length")) > WIDGET_RESPONSE_LIMIT) {
    await response.body?.cancel()
    throw new WidgetNetworkError("responseTooLarge")
  }
  const reader = response.body?.getReader()
  if (!reader) throw new WidgetNetworkError("invalidResponse")
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > WIDGET_RESPONSE_LIMIT) {
        await reader.cancel()
        throw new WidgetNetworkError("responseTooLarge")
      }
      chunks.push(decoder.decode(value, { stream: true }))
    }
    chunks.push(decoder.decode())
    return chunks.join("")
  } finally {
    reader.releaseLock()
  }
}

export async function fetchWidgetText(url: string, signal: AbortSignal) {
  const response = await requestWidget(url, signal, {
    headers: {
      Accept:
        "application/json, application/atom+xml, application/rss+xml, text/xml",
    },
  })
  return readWidgetResponse(response)
}

/** JSON POST with the same timeout, redirect, credential and size policy. */
export async function postWidgetJson(
  url: string,
  body: unknown,
  signal: AbortSignal,
  headers: Record<string, string> = {}
) {
  const response = await requestWidget(url, signal, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  })
  return readWidgetResponse(response)
}

/** Form POST for LibreTranslate and similar endpoints. */
export async function postWidgetForm(
  url: string,
  body: URLSearchParams,
  signal: AbortSignal,
  headers: Record<string, string> = {}
) {
  const response = await requestWidget(url, signal, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: body.toString(),
  })
  return readWidgetResponse(response)
}

function children(element: Element, name: string): Element[] {
  return Array.from(element.childNodes).filter(
    (node): node is Element =>
      node.nodeType === 1 && (node as Element).localName === name
  )
}

/** RSS 2.0, RDF and Atom; remote markup is displayed as text only. */
export function parseFeed(xml: string, source: string): FeedData {
  if (/<!DOCTYPE/i.test(xml)) throw new WidgetNetworkError("invalidResponse")
  const doc = new DOMParser().parseFromString(xml, "text/xml")
  if (!doc.documentElement || doc.getElementsByTagName("parsererror").length)
    throw new WidgetNetworkError("invalidResponse")
  if (!["rss", "RDF", "feed"].includes(doc.documentElement.localName))
    throw new WidgetNetworkError("invalidResponse")
  const entries: FeedData["entries"] = []
  const seen = new Set<string>()
  for (const element of Array.from(doc.getElementsByTagName("*"))) {
    if (!["item", "entry"].includes(element.localName)) continue
    const links = children(element, "link")
    const alternate = links.find(
      (link) =>
        link.hasAttribute("href") &&
        (!link.hasAttribute("rel") || link.getAttribute("rel") === "alternate")
    )
    const raw = alternate?.getAttribute("href") ?? links[0]?.textContent?.trim()
    const url = safeLink(raw, source)
    if (!url || seen.has(url)) continue
    seen.add(url)
    const title = children(element, "title")[0]
      ?.textContent?.trim()
      .slice(0, 160)
    entries.push({ title: title || new URL(url).hostname, url })
    if (entries.length === 5) break
  }
  return { kind: "rss", entries }
}

export function mapQWeatherError(error: QWeatherError): WidgetNetworkErrorCode {
  switch (error.code) {
    case "notConfigured":
      return "notConfigured"
    case "authFailed":
      return "authFailed"
    case "quotaExceeded":
      return "quotaExceeded"
    case "rateLimited":
      return "rateLimited"
    case "invalidResponse":
      return "invalidResponse"
    case "requestFailed":
      return "requestFailed"
  }
}

export async function readRemoteWidget(
  item: RemoteWidgetItem,
  signal: AbortSignal,
  config: WeatherConfig | null,
  language: string
) {
  if (item.kind === "rss") {
    const url = widgetRequestUrl(item)
    return parseFeed(await fetchWidgetText(url, signal), url)
  }
  if (
    item.latitude === null ||
    item.longitude === null ||
    !Number.isFinite(item.latitude) ||
    Math.abs(item.latitude) > 90 ||
    !Number.isFinite(item.longitude) ||
    Math.abs(item.longitude) > 180
  )
    throw new WidgetNetworkError("notConfigured")
  if (!config) throw new WidgetNetworkError("notConfigured")
  if (config.provider === "open-meteo") {
    try {
      return await fetchOpenMeteoWeather(
        item.latitude,
        item.longitude,
        item.unit,
        language,
        signal
      )
    } catch (error) {
      if (error instanceof WidgetNetworkError) throw error
      throw new WidgetNetworkError("requestFailed")
    }
  }
  try {
    return await fetchQWeatherWeather(
      item.latitude,
      item.longitude,
      item.unit,
      config,
      language,
      signal
    )
  } catch (error) {
    if (error instanceof QWeatherError)
      throw new WidgetNetworkError(mapQWeatherError(error))
    throw new WidgetNetworkError("requestFailed")
  }
}
