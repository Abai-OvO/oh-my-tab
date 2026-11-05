import { describe, expect, test } from "vitest"
import { snapshot } from "@/application/config-transfer"
import { useWeatherStore } from "@/stores/weather-store"

describe("weather credentials", () => {
  test("stay out of the exported data snapshot", () => {
    const previous = useWeatherStore.getState()
    useWeatherStore.setState({
      apiHost: "https://secret.re.qweatherapi.com",
      apiKey: "super-secret-key",
    })
    try {
      const serialized = JSON.stringify(snapshot())
      expect(serialized).not.toContain("super-secret-key")
      expect(serialized).not.toContain("re.qweatherapi.com")
    } finally {
      useWeatherStore.setState(previous)
    }
  })
})
