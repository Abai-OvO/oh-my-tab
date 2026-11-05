export type WeatherWind = {
  direction?: string
  scale?: number
  speed?: number
  unit?: string
}

export type WeatherPrecipitation = {
  amount: number
  unit: string
}

export type WeatherDay = {
  date: string
  high: number
  low: number
  code: number | null
  description?: string
  humidity?: number
  precipitation?: WeatherPrecipitation
  wind?: WeatherWind
  sunrise?: string
  sunset?: string
}

export type WeatherData = {
  kind: "weather"
  temperature: number
  code: number | null
  description?: string
  fetchedAt: number
  feelsLike?: number
  humidity?: number
  pressure?: { value: number; unit: string }
  precipitation?: WeatherPrecipitation
  visibility?: number
  wind?: WeatherWind
  sunrise?: string
  sunset?: string
  forecast: WeatherDay[]
}

export type WeatherHour = {
  time: string
  temperature: number
  code: number | null
  description?: string
  precipitation: number
  precipitationProbability: number
  windScale: number | null
  windSpeed?: number
  windDirection?: string
}

export type WeatherAirQuality = {
  aqi: number
  category: string
  level?: number
  advice?: string
}

export type WeatherDetails = {
  hourly: WeatherHour[]
  air: WeatherAirQuality | null
}
