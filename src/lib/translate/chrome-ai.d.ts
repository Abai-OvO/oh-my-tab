export {}

type ChromeAiAvailability =
  "available" | "downloadable" | "downloading" | "unavailable"

type ChromeAiDownloadEvent = Event & { loaded: number }

interface ChromeAiDownloadMonitor {
  addEventListener(
    type: "downloadprogress",
    listener: (event: ChromeAiDownloadEvent) => void
  ): void
}

interface ChromeTranslatorInstance {
  translate(text: string): Promise<string>
  destroy(): void
}

interface ChromeTranslatorConstructor {
  availability(options: {
    sourceLanguage: string
    targetLanguage: string
  }): Promise<ChromeAiAvailability>
  create(options: {
    sourceLanguage: string
    targetLanguage: string
    monitor?: (monitor: ChromeAiDownloadMonitor) => void
  }): Promise<ChromeTranslatorInstance>
}

interface ChromeLanguageDetectorInstance {
  detect(
    text: string
  ): Promise<{ detectedLanguage: string; confidence: number }[]>
  destroy(): void
}

interface ChromeLanguageDetectorConstructor {
  availability(): Promise<ChromeAiAvailability>
  create(options?: {
    monitor?: (monitor: ChromeAiDownloadMonitor) => void
  }): Promise<ChromeLanguageDetectorInstance>
}

declare global {
  var Translator: ChromeTranslatorConstructor | undefined
  var LanguageDetector: ChromeLanguageDetectorConstructor | undefined
}
