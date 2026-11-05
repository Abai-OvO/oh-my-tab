import { afterEach, describe, expect, test, vi } from "vitest"
import { fetchWidgetText, WIDGET_RESPONSE_LIMIT } from "@/lib/widgets/network"
import type { RemoteWidgetItem } from "@/lib/grid/utility-types"

const requestOrigin = vi.hoisted(() => vi.fn())
const hasOrigin = vi.hoisted(() => vi.fn())
vi.mock("@/stores/privacy-store", () => ({
  requestWidgetOrigin: requestOrigin,
  hasWidgetOrigin: hasOrigin,
}))
import {
  loadRemoteWidget,
  loadWeatherDetails,
} from "@/application/widget-network"
import { WEATHER_CACHE_TTL } from "@/lib/widgets/weather-cache"

const config = {
  provider: "qweather" as const,
  apiHost: "https://abc.re.qweatherapi.com",
  apiKey: "test-key",
}
const weather: RemoteWidgetItem = {
  id: "weather",
  name: "Weather",
  color: "#123456",
  size: "large",
  kind: "weather",
  latitude: 35.68,
  longitude: 139.69,
  locationName: "Tokyo",
  unit: "celsius",
}

function mockQWeatherFetch() {
  const fetch = vi.fn().mockImplementation((input: URL) => {
    const url = String(input)
    if (url.includes("/weather/v1/current/"))
      return Promise.resolve(
        new Response(
          JSON.stringify({
            condition: { text: "晴", code: "100" },
            temperature: { value: 22, unit: "°C" },
          })
        )
      )
    if (url.includes("/weather/v1/daily/"))
      return Promise.resolve(
        new Response(
          JSON.stringify({
            days: [
              {
                forecastStartTime: "2026-09-24T00:00:00+08:00",
                temperatureMax: { value: 25, unit: "°C" },
                temperatureMin: { value: 18, unit: "°C" },
                daytime: { condition: { text: "晴", code: "100" } },
              },
            ],
          })
        )
      )
    return Promise.resolve(new Response("", { status: 404 }))
  })
  vi.stubGlobal("fetch", fetch)
  return fetch
}

function mockFetch(response: Response) {
  const fetch = vi.fn().mockResolvedValue(response)
  vi.stubGlobal("fetch", fetch)
  return fetch
}

function mockQWeatherDetailsFetch() {
  const fetch = vi.fn().mockImplementation((input: URL) => {
    const url = String(input)
    if (url.includes("/weather/v1/hourly/"))
      return Promise.resolve(
        new Response(
          JSON.stringify({
            code: "200",
            hours: [
              {
                forecastTime: "2026-10-18T05:00+08:00",
                condition: { text: "晴", code: "100" },
                temperature: { value: 6, unit: "°C" },
              },
            ],
          })
        )
      )
    return Promise.resolve(
      new Response(
        JSON.stringify({
          code: "200",
          indexes: [{ code: "cn-mee", aqi: 23, category: "优", level: "1" }],
        })
      )
    )
  })
  vi.stubGlobal("fetch", fetch)
  return fetch
}

function mockChromeStorage() {
  const store = new Map<string, unknown>()
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (keys: string[]) => {
          const result: Record<string, unknown> = {}
          for (const key of keys) result[key] = store.get(key)
          return result
        },
        set: async (values: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(values))
            store.set(key, value)
        },
      },
    },
  })
  return store
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe("manual widget requests", () => {
  test("requests permission on click; refusal prevents fetch", async () => {
    requestOrigin.mockResolvedValue(false)
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const pending = loadRemoteWidget(
      weather,
      new AbortController().signal,
      config,
      "zh"
    )
    expect(requestOrigin).toHaveBeenCalledWith(config.apiHost)
    await expect(pending).rejects.toMatchObject({ code: "permissionDenied" })
    expect(fetch).not.toHaveBeenCalled()
  })

  test("loads the free source through Open-Meteo without credentials", async () => {
    requestOrigin.mockResolvedValue(true)
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          current: {
            temperature_2m: 21,
            weather_code: 0,
            relative_humidity_2m: 50,
            apparent_temperature: 20,
            precipitation: 0,
            pressure_msl: 1010,
            wind_speed_10m: 5,
            wind_direction_10m: 0,
          },
          daily: {
            time: ["2026-10-22"],
            weather_code: [0],
            temperature_2m_max: [23],
            temperature_2m_min: [15],
            precipitation_sum: [0],
            wind_speed_10m_max: [8],
            wind_direction_10m_dominant: [45],
            sunrise: ["2026-10-22T06:00"],
            sunset: ["2026-10-22T17:00"],
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", fetch)
    await expect(
      loadRemoteWidget(
        weather,
        new AbortController().signal,
        { provider: "open-meteo" },
        "zh"
      )
    ).resolves.toMatchObject({ kind: "weather", temperature: 21 })
    expect(requestOrigin).toHaveBeenCalledWith("https://api.open-meteo.com")
    expect(String(fetch.mock.calls[0][0])).toContain("api.open-meteo.com")
  })

  test("automatic loads skip the permission prompt", async () => {
    hasOrigin.mockResolvedValue(true)
    mockQWeatherFetch()
    await expect(
      loadRemoteWidget(weather, new AbortController().signal, config, "zh", {
        requestPermission: false,
      })
    ).resolves.toMatchObject({ kind: "weather", temperature: 22 })
    expect(requestOrigin).not.toHaveBeenCalled()
  })

  test("automatic loads reuse a fresh cache", async () => {
    const store = mockChromeStorage()
    hasOrigin.mockResolvedValue(true)
    const fetch = mockQWeatherFetch()
    const load = () =>
      loadRemoteWidget(weather, new AbortController().signal, config, "zh", {
        requestPermission: false,
        useCache: true,
      })
    await expect(load()).resolves.toMatchObject({
      kind: "weather",
      temperature: 22,
    })
    await expect(load()).resolves.toMatchObject({
      kind: "weather",
      temperature: 22,
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(store.size).toBe(1)
    expect(JSON.stringify([...store.entries()])).not.toContain("test-key")
  })

  test("manual refreshes bypass the cache", async () => {
    mockChromeStorage()
    hasOrigin.mockResolvedValue(true)
    const fetch = mockQWeatherFetch()
    const load = (useCache: boolean) =>
      loadRemoteWidget(weather, new AbortController().signal, config, "zh", {
        requestPermission: false,
        useCache,
      })
    await load(true)
    await load(false)
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  test("expired cache entries are ignored", async () => {
    const store = mockChromeStorage()
    hasOrigin.mockResolvedValue(true)
    const fetch = mockQWeatherFetch()
    const load = () =>
      loadRemoteWidget(weather, new AbortController().signal, config, "zh", {
        requestPermission: false,
        useCache: true,
      })
    await load()
    const entry = [...store.entries()][0]
    if (!entry) throw new Error("cache entry missing")
    store.set(entry[0], {
      ...(entry[1] as object),
      savedAt: Date.now() - WEATHER_CACHE_TTL - 1,
    })
    await load()
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  test("granted requests call QWeather with the API key header", async () => {
    requestOrigin.mockResolvedValue(true)
    const fetch = mockQWeatherFetch()
    const pending = loadRemoteWidget(
      weather,
      new AbortController().signal,
      config,
      "zh"
    )
    await expect(pending).resolves.toMatchObject({
      kind: "weather",
      temperature: 22,
      description: "晴",
      forecast: [
        {
          date: "2026-09-24",
          high: 25,
          low: 18,
          code: 0,
          description: "晴",
        },
      ],
    })
    expect(fetch).toHaveBeenCalledTimes(2)
    const [url, init] = fetch.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toContain(
      "https://abc.re.qweatherapi.com/weather/v1/current/35.68/139.69"
    )
    expect(String(url)).toContain("localTime=true")
    expect(init.headers).toEqual({ "X-QW-Api-Key": "test-key" })
    expect(init).toMatchObject({
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      cache: "no-store",
    })
  })

  test("missing QWeather configuration is rejected without fetching", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const pending = loadRemoteWidget(
      weather,
      new AbortController().signal,
      null,
      "zh"
    )
    await expect(pending).rejects.toMatchObject({ code: "notConfigured" })
    expect(requestOrigin).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  test("unconfigured locations neither request permission nor fetch", async () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const empty = { ...weather, latitude: null, longitude: null }
    const pending = loadRemoteWidget(
      empty,
      new AbortController().signal,
      config,
      "zh"
    )
    await expect(pending).rejects.toMatchObject({ code: "notConfigured" })
    expect(requestOrigin).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  test("aborting while permission is pending prevents fetch", async () => {
    let grant!: (value: boolean) => void
    requestOrigin.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          grant = resolve
        })
    )
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    const controller = new AbortController()
    const pending = loadRemoteWidget(weather, controller.signal, config, "zh")
    controller.abort()
    grant(true)
    await expect(pending).rejects.toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()
  })

  test("reports API rate limits", async () => {
    mockFetch(new Response("", { status: 429 }))
    const signal = new AbortController().signal
    const pending = fetchWidgetText("https://example.com", signal)
    await expect(pending).rejects.toMatchObject({ code: "rateLimited" })
  })

  test("rejects an advertised oversized response", async () => {
    const headers = { "content-length": String(WIDGET_RESPONSE_LIMIT + 1) }
    mockFetch(new Response("x", { headers }))
    const signal = new AbortController().signal
    const pending = fetchWidgetText("https://example.com", signal)
    await expect(pending).rejects.toMatchObject({ code: "responseTooLarge" })
  })

  test("bounds streamed bytes without trusting Content-Length", async () => {
    mockFetch(new Response("x".repeat(WIDGET_RESPONSE_LIMIT + 1)))
    const signal = new AbortController().signal
    const pending = fetchWidgetText("https://example.com", signal)
    await expect(pending).rejects.toMatchObject({ code: "responseTooLarge" })
  })
})

describe("weather details", () => {
  test("requires an already-granted API host permission", async () => {
    hasOrigin.mockResolvedValue(false)
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    await expect(
      loadWeatherDetails(weather, config, "zh", new AbortController().signal, {
        useCache: true,
      })
    ).rejects.toMatchObject({ code: "permissionDenied" })
    expect(fetch).not.toHaveBeenCalled()
  })

  test("caches hourly and air-quality data", async () => {
    mockChromeStorage()
    hasOrigin.mockResolvedValue(true)
    const fetch = mockQWeatherDetailsFetch()
    const load = (useCache: boolean) =>
      loadWeatherDetails(weather, config, "zh", new AbortController().signal, {
        useCache,
      })
    await expect(load(true)).resolves.toMatchObject({
      hourly: [{ temperature: 6 }],
      air: { aqi: 23, category: "优" },
    })
    await load(true)
    expect(fetch).toHaveBeenCalledTimes(2)
    await load(false)
    expect(fetch).toHaveBeenCalledTimes(4)
  })
})
