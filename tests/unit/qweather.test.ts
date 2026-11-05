import { afterEach, describe, expect, test, vi } from "vitest"
import {
  fetchQWeatherWeather,
  fetchWeatherDetails,
  geoApiEndpoint,
  normalizeQWeatherHost,
  placeQueryVariants,
  reversePlace,
  searchPlaces,
  type QWeatherConfig,
} from "@/lib/widgets/qweather"

const config: QWeatherConfig = {
  apiHost: "https://abc.re.qweatherapi.com",
  apiKey: "test-key",
}

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    })
  )
}

function lookups() {
  return [
    {
      name: "晋源区",
      id: "101100101",
      lat: "37.735",
      lon: "112.442",
      adm2: "太原市",
      adm1: "山西省",
      country: "中国",
      type: "district",
    },
  ]
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe("QWeather host and search", () => {
  test("accepts only a dedicated HTTPS host origin", () => {
    expect(normalizeQWeatherHost("https://abc.re.qweatherapi.com/")).toBe(
      "https://abc.re.qweatherapi.com"
    )
    expect(() => normalizeQWeatherHost("http://abc.example.com")).toThrow(
      "notConfigured"
    )
    expect(() => normalizeQWeatherHost("https://abc.example.com/path")).toThrow(
      "notConfigured"
    )
  })

  test("routes GeoAPI through the API host, with the public host for legacy", () => {
    expect(geoApiEndpoint(config)).toEqual({
      host: "https://abc.re.qweatherapi.com",
      path: "/geo/v2/city/lookup",
    })
    expect(
      geoApiEndpoint({
        apiHost: "https://devapi.qweather.com",
        apiKey: "test-key",
      })
    ).toEqual({
      host: "https://geoapi.qweather.com",
      path: "/v2/city/lookup",
    })
  })

  test("expands a full Chinese address into district-level queries", () => {
    expect(placeQueryVariants("太原市晋源区")).toEqual([
      "太原市晋源区",
      "太原市 晋源区",
      "晋源区",
    ])
  })

  test("finds a district and sends the key in the QWeather header", async () => {
    const fetch = vi.fn().mockImplementation((input: URL) => {
      const location = input.searchParams.get("location")
      return json(
        location === "太原市 晋源区"
          ? { code: "200", location: lookups() }
          : { code: "200", location: [] }
      )
    })
    vi.stubGlobal("fetch", fetch)
    await expect(
      searchPlaces(
        "太原市晋源区",
        config,
        "zh-CN",
        new AbortController().signal
      )
    ).resolves.toEqual([
      {
        id: "101100101",
        name: "晋源区",
        latitude: 37.735,
        longitude: 112.442,
        city: "太原市",
        state: "山西省",
        country: "中国",
        kind: "district",
      },
    ])
    expect(fetch).toHaveBeenCalledTimes(2)
    const [url, init] = fetch.mock.calls[0] as [URL, RequestInit]
    expect(String(url)).toContain(
      "https://abc.re.qweatherapi.com/geo/v2/city/lookup"
    )
    expect(String(url)).toContain("number=6")
    expect(init.headers).toEqual({ "X-QW-Api-Key": "test-key" })
  })

  test("reverse lookup resolves a coordinate to a district", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() => json({ code: "200", location: lookups() }))
    )
    await expect(
      reversePlace(
        37.735,
        112.442,
        config,
        "zh-CN",
        new AbortController().signal
      )
    ).resolves.toEqual({
      city: "太原市",
      district: "晋源区",
      state: "山西省",
      country: "中国",
    })
  })

  test("maps QWeather auth and quota codes to stable errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => json({ code: "402" }))
    )
    await expect(
      searchPlaces("上海", config, "zh-CN", new AbortController().signal)
    ).rejects.toMatchObject({ code: "quotaExceeded" })
  })
})

describe("QWeather weather details", () => {
  test("maps hourly weather and air quality", async () => {
    const fetch = vi.fn().mockImplementation((input: URL) => {
      const url = String(input)
      if (url.includes("/weather/v1/hourly/"))
        return json({
          code: "200",
          hours: [
            {
              forecastTime: "2026-10-18T05:00+08:00",
              condition: { text: "晴", code: "100" },
              temperature: { value: 6.14, unit: "°C" },
              precipitation: {
                amount: { value: 0.2, unit: "mm" },
                probability: 0.35,
              },
              wind: {
                scale: 2,
                speed: { value: 2.08, unit: "m/s" },
                direction: { compass: "sw" },
              },
            },
          ],
        })
      return json({
        code: "200",
        indexes: [
          {
            code: "cn-mee",
            aqi: 23,
            category: "优",
            level: "1",
            health: {
              effect: "空气质量令人满意。",
              advice: { generalPopulation: "各类人群可正常活动。" },
            },
          },
        ],
      })
    })
    vi.stubGlobal("fetch", fetch)
    const details = await fetchWeatherDetails(
      37.735,
      112.442,
      "celsius",
      config,
      "zh-CN",
      new AbortController().signal
    )
    expect(details.hourly).toEqual([
      {
        time: "2026-10-18T05:00+08:00",
        temperature: 6.14,
        code: 0,
        description: "晴",
        precipitation: 0.2,
        precipitationProbability: 35,
        windScale: 2,
        windSpeed: 2.08,
        windDirection: "西南风",
      },
    ])
    expect(details.air).toEqual({
      aqi: 23,
      category: "优",
      level: 1,
      advice: "各类人群可正常活动。",
    })
    const urls = fetch.mock.calls.map(([url]) => String(url))
    expect(
      urls.some((url) => url.includes("/weather/v1/hourly/37.735/112.442"))
    ).toBe(true)
    expect(
      urls.some((url) => url.includes("/airquality/v1/current/37.735/112.442"))
    ).toBe(true)
  })

  test("keeps hourly data when air quality is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: URL) => {
        const url = String(input)
        if (url.includes("/weather/v1/hourly/"))
          return json({
            code: "200",
            hours: [
              {
                forecastTime: "2026-10-18T05:00+08:00",
                condition: { text: "晴", code: "100" },
                temperature: { value: 6, unit: "°C" },
              },
            ],
          })
        return Promise.resolve(new Response("", { status: 404 }))
      })
    )
    await expect(
      fetchWeatherDetails(
        37.735,
        112.442,
        "celsius",
        config,
        "zh-CN",
        new AbortController().signal
      )
    ).resolves.toMatchObject({ air: null, hourly: [{ temperature: 6 }] })
  })

  test("fails when hourly data is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: URL) => {
        if (String(input).includes("/weather/v1/hourly/"))
          return Promise.resolve(new Response("", { status: 500 }))
        return json({ code: "200", indexes: [] })
      })
    )
    await expect(
      fetchWeatherDetails(
        37.735,
        112.442,
        "celsius",
        config,
        "zh-CN",
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: "requestFailed" })
  })
})

describe("QWeather weather mapping", () => {
  test("maps v1 current and daily forecasts with Celsius values", async () => {
    const fetch = vi.fn().mockImplementation((input: URL) => {
      const url = String(input)
      if (url.includes("/weather/v1/current/"))
        return json({
          condition: { text: "多云", code: "101" },
          temperature: { value: 11, unit: "°C" },
        })
      return json({
        days: [
          {
            forecastStartTime: "2026-10-18T00:00:00+08:00",
            temperatureMax: { value: 13, unit: "°C" },
            temperatureMin: { value: 4, unit: "°C" },
            daytime: { condition: { text: "多云", code: "101" } },
          },
          {
            forecastStartTime: "2026-10-19T00:00:00+08:00",
            temperatureMax: { value: 20, unit: "°C" },
            temperatureMin: { value: 4, unit: "°C" },
            daytime: { condition: { text: "小雨", code: "305" } },
          },
        ],
      })
    })
    vi.stubGlobal("fetch", fetch)
    await expect(
      fetchQWeatherWeather(
        37.735,
        112.442,
        "celsius",
        config,
        "zh-CN",
        new AbortController().signal
      )
    ).resolves.toEqual({
      kind: "weather",
      temperature: 11,
      code: 2,
      description: "多云",
      fetchedAt: expect.any(Number),
      forecast: [
        {
          date: "2026-10-18",
          high: 13,
          low: 4,
          code: 2,
          description: "多云",
        },
        {
          date: "2026-10-19",
          high: 20,
          low: 4,
          code: 61,
          description: "小雨",
        },
      ],
    })
    const [url] = fetch.mock.calls[0] as [URL]
    expect(String(url)).toContain(
      "https://abc.re.qweatherapi.com/weather/v1/current/37.735/112.442"
    )
    expect(String(url)).toContain("localTime=true")
  })

  test("converts Celsius values when Fahrenheit is selected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: URL) => {
        const url = String(input)
        if (url.includes("/weather/v1/current/"))
          return json({
            condition: { text: "晴", code: "100" },
            temperature: { value: 0, unit: "°C" },
          })
        return json({
          days: [
            {
              forecastStartTime: "2026-10-18T00:00:00+08:00",
              temperatureMax: { value: 10, unit: "°C" },
              temperatureMin: { value: -10, unit: "°C" },
              daytime: { condition: { text: "晴", code: "100" } },
            },
          ],
        })
      })
    )
    const result = await fetchQWeatherWeather(
      37.735,
      112.442,
      "fahrenheit",
      config,
      "en",
      new AbortController().signal
    )
    expect(result.temperature).toBe(32)
    expect(result.forecast[0]?.high).toBe(50)
    expect(result.forecast[0]?.low).toBe(14)
  })

  test("falls back to v7 when the v1 endpoints are unavailable", async () => {
    const fetch = vi.fn().mockImplementation((input: URL) => {
      const url = String(input)
      if (url.includes("/weather/v1/"))
        return Promise.resolve(new Response("", { status: 404 }))
      if (url.includes("/v7/weather/now"))
        return json({
          code: "200",
          now: { temp: "11", icon: "101", text: "多云" },
        })
      return json({
        code: "200",
        daily: [
          {
            fxDate: "2026-10-18",
            tempMax: "13",
            tempMin: "4",
            iconDay: "101",
            textDay: "多云",
          },
        ],
      })
    })
    vi.stubGlobal("fetch", fetch)
    await expect(
      fetchQWeatherWeather(
        37.735,
        112.442,
        "celsius",
        config,
        "zh-CN",
        new AbortController().signal
      )
    ).resolves.toMatchObject({
      kind: "weather",
      temperature: 11,
      description: "多云",
    })
  })

  test("rejects invalid payloads instead of inventing weather", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => json({ days: [] }))
    )
    await expect(
      fetchQWeatherWeather(
        37.735,
        112.442,
        "celsius",
        config,
        "zh-CN",
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: "invalidResponse" })
  })
})
