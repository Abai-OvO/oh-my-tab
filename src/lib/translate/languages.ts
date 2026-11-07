/**
 * Canonical language tags shared by the widget item, the panel and adapters.
 * The list is deliberately fixed: persisted items must never depend on a
 * later browser or provider release.
 */
export const translateLanguages = [
  "ar",
  "bg",
  "bn",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "fi",
  "fr",
  "hi",
  "hr",
  "hu",
  "id",
  "it",
  "iw",
  "ja",
  "kn",
  "ko",
  "lt",
  "nl",
  "no",
  "pl",
  "pt",
  "ro",
  "ru",
  "sk",
  "sl",
  "sv",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "vi",
  "zh",
  "zh-Hant",
] as const

export type TranslateLanguage = (typeof translateLanguages)[number]

const languageSet = new Set<string>(translateLanguages)

export function isTranslateLanguage(
  value: unknown
): value is TranslateLanguage {
  return typeof value === "string" && languageSet.has(value)
}

/** LibreTranslate uses `zt` for Traditional Chinese and lowercase tags. */
export function libreLanguage(code: string) {
  if (code === "zh-Hant") return "zt"
  return code.toLowerCase()
}

function browserLanguage() {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.language === "string"
  )
    return navigator.language
  return "en"
}

/**
 * Maps BCP-47 browser tags onto the fixed catalogue. Chinese needs script
 * handling because the catalogue only carries `zh` and `zh-Hant`.
 */
export function canonicalLanguage(value: unknown): TranslateLanguage | null {
  if (typeof value !== "string") return null
  const input = value.trim().replaceAll("_", "-")
  if (!input) return null
  const lower = input.toLowerCase()
  const exact = translateLanguages.find(
    (language) => language.toLowerCase() === lower
  )
  if (exact) return exact
  const [base, ...rest] = lower.split("-")
  if (base === "zh") {
    if (
      rest.some(
        (part) =>
          part === "hant" || part === "tw" || part === "hk" || part === "mo"
      )
    )
      return "zh-Hant"
    return "zh"
  }
  if (base === "he") return "iw"
  if (base === "nb" || base === "nn") return "no"
  return translateLanguages.find((language) => language === base) ?? null
}

/** Default target for a new widget; browser UI language, then English. */
export function defaultTargetLanguage(
  value: string | undefined = browserLanguage()
) {
  return canonicalLanguage(value) ?? "en"
}

/** A concrete source when the Chrome provider cannot auto-detect. */
export function fallbackSourceLanguage(target: string) {
  return target === "en" ? "zh" : "en"
}

export function languageName(code: string, locale: string) {
  const canonical = canonicalLanguage(code) ?? code
  try {
    return (
      new Intl.DisplayNames([locale], {
        type: "language",
        fallback: "code",
      }).of(canonical) ?? canonical
    )
  } catch {
    return canonical
  }
}

/** The app's own UI languages, promoted above the alphabetical list. */
export const commonTranslateLanguages = [
  "zh",
  "en",
] as const satisfies readonly TranslateLanguage[]

/** Alphabetize by the localized name rather than by the compact tag. */
export function sortedTranslateLanguages(locale: string) {
  let collator: Intl.Collator
  try {
    collator = new Intl.Collator(locale, { sensitivity: "base" })
  } catch {
    collator = new Intl.Collator("en", { sensitivity: "base" })
  }
  return [...translateLanguages].sort((left, right) =>
    collator.compare(languageName(left, locale), languageName(right, locale))
  )
}
