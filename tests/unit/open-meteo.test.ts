import { afterEach, describe, expect, test, vi } from "vitest"
import {
  fetchOpenMeteoDetails,
  fetchOpenMeteoWeather,
  searchOpenMeteoPlaces,
} from "@/lib/widgets/open-meteo"
import { WidgetNetworkError } from "@/lib/widgets/errors"
import { resolveWeatherProvider } from "@/lib/widgets/weather-provider"

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    })
  )
}

function stubFetch(payload: unknown, status = 200) {
  const requests: URL[] = []
  const fetchMock = vi.fn((input: string | URL) => {
    requests.push(new URL(String(input)))
    return json(payload, status)
  })
  vi.stubGlobal("fetch", fetchMock)
  return requests
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

const forecast = {
  current: {
    time: "2026-10-22T14:00",
    temperature_2m: 21.4,
    relative_humidity_2m: 63,
    apparent_temperature: 20.8,
    precipitation: 0.2,
    weather_code: 61,
    pressure_msl: 1012.3,
    wind_speed_10m: 13,
    wind_direction_10m: 225,
  },
  daily: {
    time: ["2026-10-22", "2026-10-23"],
    weather_code: [61, 0],
    temperature_2m_max: [23.5, 25.1],
    temperature_2m_min: [15.2, 16.4],
    precipitation_sum: [1.2, 0],
    wind_speed_10m_max: [18, 9],
    wind_direction_10m_dominant: [200, 90],
    sunrise: ["2026-10-22T06:12", "2026-10-23T06:13"],
    sunset: ["2026-10-22T17:24", "2026-10-23T17:23"],
  },
}

describe("Open-Meteo forecast", () => {
  test("maps current and daily data onto the shared weather model", async () => {
    const requests = stubFetch(forecast)
    const data = await fetchOpenMeteoWeather(
      31.2304,
      121.4737,
      "celsius",
      "zh",
      new AbortController().signal
    )
    expect(requests[0].origin).toBe("https://api.open-meteo.com")
    expect(requests[0].searchParams.get("models")).toBe("best_match")
    expect(requests[0].searchParams.get("forecast_days")).toBe("7")
    expect(requests[0].searchParams.get("temperature_unit")).toBe("celsius")
    expect(data).toMatchObject({
      kind: "weather",
      temperature: 21.4,
      code: 61,
      feelsLike: 20.8,
      humidity: 63,
      pressure: { value: 1012.3, unit: "hPa" },
      precipitation: { amount: 0.2, unit: "mm" },
      sunrise: "06:12",
      sunset: "17:24",
      wind: { direction: "西南风", scale: 3, speed: 13, unit: "km/h" },
    })
    expect(data.forecast).toHaveLength(2)
    expect(data.forecast[0]).toMatchObject({
      date: "2026-10-22",
      high: 23.5,
      low: 15.2,
      code: 61,
      precipitation: { amount: 1.2, unit: "mm" },
      wind: { direction: "南风", scale: 3, speed: 18, unit: "km/h" },
      sunrise: "06:12",
      sunset: "17:24",
    })
    expect(typeof data.fetchedAt).toBe("number")
  })

  test("requests fahrenheit when the widget uses imperial units", async () => {
    const requests = stubFetch(forecast)
    await fetchOpenMeteoWeather(
      31.2304,
      121.4737,
      "fahrenheit",
      "en",
      new AbortController().signal
    )
    expect(requests[0].searchParams.get("temperature_unit")).toBe("fahrenheit")
  })

  test("rejects a structurally invalid response", async () => {
    stubFetch({ current: {}, daily: {} })
    await expect(
      fetchOpenMeteoWeather(
        31.2304,
        121.4737,
        "celsius",
        "en",
        new AbortController().signal
      )
    ).rejects.toMatchObject({ code: "invalidResponse" })
  })

  test("maps rate-limit status codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 429 })))
    )
    await expect(
      fetchOpenMeteoWeather(
        31.2304,
        121.4737,
        "celsius",
        "en",
        new AbortController().signal
      )
    ).rejects.toBeInstanceOf(WidgetNetworkError)
  })
})

describe("Open-Meteo details", () => {
  test("reads single-model hourly series with precipitation probability", async () => {
    const requests = stubFetch({
      hourly: {
        time: ["2026-10-22T14:00", "2026-10-22T15:00"],
        temperature_2m: [21.4, 21.9],
        weather_code: [61, 3],
        precipitation: [0.2, 0],
        precipitation_probability: [55, 20],
        wind_speed_10m: [13, 20],
        wind_direction_10m: [225, 230],
      },
    })
    const details = await fetchOpenMeteoDetails(
      31.2304,
      121.4737,
      "celsius",
      "zh",
      new AbortController().signal
    )
    expect(requests[0].searchParams.get("models")).toBe("best_match")
    expect(details.air).toBeNull()
    expect(details.hourly).toHaveLength(2)
    expect(details.hourly[0]).toMatchObject({
      time: "2026-10-22T14:00",
      temperature: 21.4,
      code: 61,
      precipitation: 0.2,
      precipitationProbability: 55,
      windScale: 3,
      windSpeed: 13,
      windDirection: "西南风",
    })
  })
})

describe("Open-Meteo place search", () => {
  test("maps geocoding results to places with localized hierarchy", async () => {
    stubFetch({
      results: [
        {
          id: 1796236,
          name: "上海",
          latitude: 31.22222,
          longitude: 121.45806,
          country: "中国",
          admin1: "上海市",
          admin2: "黄浦区",
          feature_code: "PPLA",
        },
      ],
    })
    const places = await searchOpenMeteoPlaces(
      "上海",
      "zh",
      new AbortController().signal
    )
    expect(places).toEqual([
      {
        id: "1796236",
        name: "上海",
        latitude: 31.22222,
        longitude: 121.45806,
        city: "上海市",
        state: "黄浦区",
        country: "中国",
        kind: "PPLA",
      },
    ])
  })
})

describe("weather provider resolution", () => {
  const item = {
    id: "weather",
    kind: "weather",
    name: "Weather",
    color: "#123456",
    size: "medium",
    locationName: "上海",
    latitude: 31.2304,
    longitude: 121.4737,
    unit: "celsius",
  } as const

  test("old items keep QWeather when credentials exist", () => {
    expect(resolveWeatherProvider(item, true)).toBe("qweather")
  })

  test("old keyless items fall back to the free source", () => {
    expect(resolveWeatherProvider(item, false)).toBe("open-meteo")
  })

  test("an explicit provider wins", () => {
    expect(
      resolveWeatherProvider({ ...item, provider: "open-meteo" }, true)
    ).toBe("open-meteo")
    expect(
      resolveWeatherProvider({ ...item, provider: "qweather" }, false)
    ).toBe("qweather")
  })
})
