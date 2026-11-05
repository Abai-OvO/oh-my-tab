import { storageOptions } from "@/lib/storage"
import { create } from "zustand"
import { persist } from "zustand/middleware"

type WeatherState = {
  apiHost: string
  apiKey: string
  setConfig: (config: { apiHost: string; apiKey: string }) => void
  reset: () => void
}

/**
 * Device-local QWeather credentials. `omt.weather` is intentionally excluded
 * from the exported snapshot allowlist, so the key never enters ZIP/WebDAV
 * backups or chrome.storage.sync.
 */
export const useWeatherStore = create<WeatherState>()(
  persist(
    (set) => ({
      apiHost: "",
      apiKey: "",
      setConfig: (config) => set(config),
      reset: () => set({ apiHost: "", apiKey: "" }),
    }),
    {
      ...storageOptions(),
      name: "omt.weather",
      partialize: ({ apiHost, apiKey }) => ({ apiHost, apiKey }),
      merge: (persisted, current) => {
        const saved = persisted as
          { apiHost?: unknown; apiKey?: unknown } | null | undefined
        return {
          ...current,
          apiHost: typeof saved?.apiHost === "string" ? saved.apiHost : "",
          apiKey: typeof saved?.apiKey === "string" ? saved.apiKey : "",
        }
      },
    }
  )
)

export const weatherConfigured = (
  state: WeatherState = useWeatherStore.getState()
) => Boolean(state.apiHost.trim() && state.apiKey.trim())
