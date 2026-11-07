import { storageOptions } from "@/lib/storage"
import type { TranslateConfig } from "@/lib/translate/types"
import { create } from "zustand"
import { persist } from "zustand/middleware"

type TranslateState = TranslateConfig & {
  setConfig: (config: Partial<TranslateConfig>) => void
  reset: () => void
}

const emptyConfig: TranslateConfig = {
  libreHost: "",
  libreApiKey: "",
  customUrl: "",
  customApiKey: "",
}

/**
 * Device-local translation provider credentials. `omt.translate` is in
 * DEVICE_KEYS and deliberately absent from snapshot(), so keys never enter
 * ZIP/WebDAV backups or chrome.storage.sync.
 */
export const useTranslateStore = create<TranslateState>()(
  persist(
    (set) => ({
      ...emptyConfig,
      setConfig: (config) => set(config),
      reset: () => set(emptyConfig),
    }),
    {
      ...storageOptions(),
      name: "omt.translate",
      partialize: ({ libreHost, libreApiKey, customUrl, customApiKey }) => ({
        libreHost,
        libreApiKey,
        customUrl,
        customApiKey,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<TranslateConfig> | null | undefined
        const text = (value: unknown) =>
          typeof value === "string" ? value : ""
        return {
          ...current,
          libreHost: text(saved?.libreHost),
          libreApiKey: text(saved?.libreApiKey),
          customUrl: text(saved?.customUrl),
          customApiKey: text(saved?.customApiKey),
        }
      },
    }
  )
)
