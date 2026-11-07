import { remoteUrl } from "@/lib/widgets/model"
import { createChromeProvider } from "./chrome-builtin"
import { createCustomProvider } from "./custom"
import { TranslateError } from "./errors"
import { createLibreProvider } from "./libre"
import {
  isTranslateProviderId,
  type TranslateConfig,
  type TranslateProvider,
  type TranslateProviderId,
} from "./types"

/** Structural slice of a persisted widget the resolver needs. */
export type TranslateSettings = {
  provider?: TranslateProviderId
  sourceLang?: string
  targetLang?: string
}

export function translateProviderId(
  item: TranslateSettings
): TranslateProviderId {
  return isTranslateProviderId(item.provider) ? item.provider : "chrome"
}

/**
 * The store is read by the component layer and passed in as plain values so
 * `src/lib` stays independent of Zustand and the UI architecture.
 */
export function resolveTranslateProvider(
  item: TranslateSettings,
  config: TranslateConfig
): TranslateProvider {
  switch (translateProviderId(item)) {
    case "chrome":
      return createChromeProvider()
    case "libre":
      return createLibreProvider(config.libreHost, config.libreApiKey)
    case "custom":
      return createCustomProvider(config.customUrl, config.customApiKey)
  }
  throw new TranslateError("notConfigured")
}

/** Public HTTPS origin used by the runtime host-permission prompt. */
export function translateProviderOrigin(
  item: TranslateSettings,
  config: TranslateConfig
) {
  const provider = translateProviderId(item)
  if (provider === "chrome") return null
  const value = provider === "libre" ? config.libreHost : config.customUrl
  const normalized = validTranslateEndpoint(value)
  return normalized ? new URL(normalized).origin : null
}

/** Shared URL rule for the settings form and the runtime adapters. */
export function validTranslateEndpoint(value: string) {
  return remoteUrl(value.trim())
}
