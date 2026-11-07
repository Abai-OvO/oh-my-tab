export const translateProviderIds = ["chrome", "libre", "custom"] as const
export type TranslateProviderId = (typeof translateProviderIds)[number]

export function isTranslateProviderId(
  value: unknown
): value is TranslateProviderId {
  return (
    typeof value === "string" &&
    translateProviderIds.some((provider) => provider === value)
  )
}

export const TRANSLATE_MAX_CHARS = 5000

export type TranslateAvailability =
  "available" | "downloadable" | "downloading" | "unsupported"

export type TranslatePair = { from: string; to: string }

export type TranslateRequest = {
  /** Length 1 today; the array keeps adapters batch-ready. */
  texts: string[]
  from: string
  to: string
  signal: AbortSignal
  onProgress?: (progress: number) => void
  /**
   * True only for a user gesture. Chrome needs activation to download a
   * language pack; background auto-translate must never create one.
   */
  allowDownload?: boolean
}

export type TranslateResult = {
  texts: string[]
  detected?: string
}

export type TranslateProvider = {
  id: TranslateProviderId
  maxChars: number
  supportsAuto: () => boolean
  availability: (pair: TranslatePair) => Promise<TranslateAvailability>
  /** User-gesture model download, Chrome only. */
  prepare?: (
    pair: TranslatePair,
    onProgress?: (progress: number) => void
  ) => Promise<void>
  translate: (request: TranslateRequest) => Promise<TranslateResult>
  /** Releases provider-owned browser resources when the panel unmounts. */
  dispose?: () => void
}

/** Plain credentials passed down from the component layer. */
export type TranslateConfig = {
  libreHost: string
  libreApiKey: string
  customUrl: string
  customApiKey: string
}
