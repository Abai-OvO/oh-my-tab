import { TranslateError } from "./errors"
import {
  TRANSLATE_MAX_CHARS,
  type TranslateAvailability,
  type TranslatePair,
  type TranslateProvider,
  type TranslateRequest,
  type TranslateResult,
} from "./types"

type DownloadMonitor = {
  addEventListener(
    type: "downloadprogress",
    listener: (event: Event & { loaded: number }) => void
  ): void
}

type TranslatorInstance = {
  translate(text: string): Promise<string>
  destroy(): void
}

type TranslatorConstructor = {
  availability(options: {
    sourceLanguage: string
    targetLanguage: string
  }): Promise<string>
  create(options: {
    sourceLanguage: string
    targetLanguage: string
    monitor?: (monitor: DownloadMonitor) => void
  }): Promise<TranslatorInstance>
}

type DetectorInstance = {
  detect(
    text: string
  ): Promise<{ detectedLanguage: string; confidence: number }[]>
  destroy(): void
}

type DetectorConstructor = {
  availability(): Promise<string>
  create(options?: {
    monitor?: (monitor: DownloadMonitor) => void
  }): Promise<DetectorInstance>
}

type ChromeAi = {
  Translator?: TranslatorConstructor
  LanguageDetector?: DetectorConstructor
}

const chromeAi = () => globalThis as typeof globalThis & ChromeAi
const translatorApi = () => chromeAi().Translator
const detectorApi = () => chromeAi().LanguageDetector

const translators = new Map<string, TranslatorInstance>()
const pendingTranslators = new Map<string, Promise<TranslatorInstance>>()
let detector: DetectorInstance | undefined
let pendingDetector: Promise<DetectorInstance> | undefined

const pairKey = (from: string, to: string) => `${from}\u0000${to}`

function availabilityValue(value: unknown): TranslateAvailability {
  return value === "available" ||
    value === "downloadable" ||
    value === "downloading"
    ? value
    : "unsupported"
}

function progressMonitor(onProgress?: (progress: number) => void) {
  if (!onProgress) return undefined
  return (monitor: DownloadMonitor) => {
    monitor.addEventListener("downloadprogress", (event) => {
      if (!Number.isFinite(event.loaded)) return
      onProgress(Math.min(1, Math.max(0, event.loaded)))
    })
  }
}

export function chromeTranslatorSupported() {
  return typeof translatorApi()?.availability === "function"
}

export function chromeAutoSupported() {
  return typeof detectorApi()?.availability === "function"
}

async function pairAvailability(
  pair: TranslatePair
): Promise<TranslateAvailability> {
  if (pair.from === "auto") {
    if (!chromeAutoSupported() || !chromeTranslatorSupported())
      return "unsupported"
    try {
      return availabilityValue(await detectorApi()!.availability())
    } catch {
      return "unsupported"
    }
  }
  if (!chromeTranslatorSupported()) return "unsupported"
  try {
    return availabilityValue(
      await translatorApi()!.availability({
        sourceLanguage: pair.from,
        targetLanguage: pair.to,
      })
    )
  } catch {
    return "unsupported"
  }
}

async function createTranslator(
  from: string,
  to: string,
  onProgress?: (progress: number) => void
) {
  const key = pairKey(from, to)
  const cached = translators.get(key)
  if (cached) return cached
  const pending = pendingTranslators.get(key)
  if (pending) return pending
  const api = translatorApi()
  if (!api) throw new TranslateError("unsupportedPair")
  const promise = api
    .create({
      sourceLanguage: from,
      targetLanguage: to,
      monitor: progressMonitor(onProgress),
    })
    .then((instance) => {
      translators.set(key, instance)
      return instance
    })
    .catch((error: unknown) => {
      if (error instanceof TranslateError) throw error
      throw new TranslateError("modelMissing")
    })
    .finally(() => {
      pendingTranslators.delete(key)
    })
  pendingTranslators.set(key, promise)
  return promise
}

async function detectorFor(
  allowDownload: boolean,
  onProgress?: (progress: number) => void
) {
  if (detector) return detector
  if (!chromeAutoSupported()) throw new TranslateError("unsupportedPair")
  const api = detectorApi()!
  let availability: TranslateAvailability
  try {
    availability = availabilityValue(await api.availability())
  } catch {
    throw new TranslateError("unsupportedPair")
  }
  if (availability === "unsupported")
    throw new TranslateError("unsupportedPair")
  if (availability !== "available" && !allowDownload)
    throw new TranslateError("modelMissing")
  pendingDetector ??= api
    .create({ monitor: progressMonitor(onProgress) })
    .then((instance) => {
      detector = instance
      return instance
    })
    .catch((error: unknown) => {
      if (error instanceof TranslateError) throw error
      throw new TranslateError("modelMissing")
    })
    .finally(() => {
      pendingDetector = undefined
    })
  return pendingDetector
}

async function detect(
  text: string,
  allowDownload: boolean,
  onProgress?: (progress: number) => void
) {
  const instance = await detectorFor(allowDownload, onProgress)
  try {
    const results = await instance.detect(text)
    const language = results.find(
      (result) => typeof result.detectedLanguage === "string"
    )?.detectedLanguage
    if (!language) throw new TranslateError("invalidResponse")
    return language
  } catch (error) {
    if (error instanceof TranslateError) throw error
    throw new TranslateError("requestFailed")
  }
}

async function translatorFor(
  from: string,
  to: string,
  allowDownload: boolean,
  onProgress?: (progress: number) => void
) {
  const cached = translators.get(pairKey(from, to))
  if (cached) return cached
  const availability = await pairAvailability({ from, to })
  if (availability === "unsupported")
    throw new TranslateError("unsupportedPair")
  if (availability !== "available" && !allowDownload)
    throw new TranslateError("modelMissing")
  return createTranslator(from, to, onProgress)
}

export function createChromeProvider(): TranslateProvider {
  return {
    id: "chrome",
    maxChars: TRANSLATE_MAX_CHARS,
    supportsAuto: chromeAutoSupported,
    availability: pairAvailability,
    async prepare(pair, onProgress) {
      if (pair.from === "auto") {
        await detectorFor(true, onProgress)
        return
      }
      const availability = await pairAvailability(pair)
      if (availability === "unsupported")
        throw new TranslateError("unsupportedPair")
      await createTranslator(pair.from, pair.to, onProgress)
    },
    async translate(request: TranslateRequest): Promise<TranslateResult> {
      if (!request.texts.length || request.texts.every((text) => !text.trim()))
        throw new TranslateError("emptyInput")
      request.signal.throwIfAborted()
      let from = request.from
      let detected: string | undefined
      if (from === "auto") {
        const detectedLanguage = await detect(
          request.texts[0],
          request.allowDownload === true,
          request.onProgress
        )
        detected = detectedLanguage
        from = detectedLanguage
      }
      const instance = await translatorFor(
        from,
        request.to,
        request.allowDownload === true,
        request.onProgress
      )
      const texts: string[] = []
      for (const text of request.texts) {
        request.signal.throwIfAborted()
        try {
          texts.push(await instance.translate(text))
        } catch (error) {
          request.signal.throwIfAborted()
          if (error instanceof TranslateError) throw error
          if (error instanceof DOMException && error.name === "NotAllowedError")
            throw new TranslateError("modelMissing")
          throw new TranslateError("requestFailed")
        }
      }
      request.signal.throwIfAborted()
      return { texts, ...(detected ? { detected } : {}) }
    },
    dispose() {
      for (const instance of translators.values()) {
        try {
          instance.destroy()
        } catch {
          /* A destroyed translator is already gone. */
        }
      }
      translators.clear()
      pendingTranslators.clear()
      try {
        detector?.destroy()
      } catch {
        /* A destroyed detector is already gone. */
      }
      detector = undefined
      pendingDetector = undefined
    },
  }
}
