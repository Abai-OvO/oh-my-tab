import { remoteUrl } from "@/lib/widgets/model"
import { postWidgetForm } from "@/lib/widgets/network"
import { mapTranslateNetworkError, TranslateError } from "./errors"
import { libreLanguage } from "./languages"
import {
  TRANSLATE_MAX_CHARS,
  type TranslateProvider,
  type TranslateRequest,
} from "./types"

function libreEndpoint(host: string) {
  const normalized = remoteUrl(host.trim())
  if (!normalized) throw new TranslateError("notConfigured")
  const url = new URL(normalized)
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/translate`
  url.search = ""
  url.hash = ""
  return url.href
}

export function createLibreProvider(
  host: string,
  apiKey: string
): TranslateProvider {
  const endpoint = libreEndpoint(host)
  const key = apiKey.trim()

  return {
    id: "libre",
    maxChars: TRANSLATE_MAX_CHARS,
    supportsAuto: () => true,
    availability: async () => "available",
    async translate(request: TranslateRequest) {
      if (request.texts.length !== 1)
        throw new TranslateError("invalidResponse")
      const text = request.texts[0]
      if (!text.trim()) throw new TranslateError("emptyInput")
      const body = new URLSearchParams({
        q: text,
        source: request.from,
        target: libreLanguage(request.to),
        format: "text",
      })
      if (key) body.set("api_key", key)
      let payload: string
      try {
        payload = await postWidgetForm(endpoint, body, request.signal)
      } catch (error) {
        if (request.signal.aborted) throw error
        throw mapTranslateNetworkError(error, Boolean(key))
      }
      let data: unknown
      try {
        data = JSON.parse(payload)
      } catch {
        throw new TranslateError("invalidResponse")
      }
      if (!data || typeof data !== "object")
        throw new TranslateError("invalidResponse")
      const translated = (data as { translatedText?: unknown }).translatedText
      if (typeof translated !== "string")
        throw new TranslateError("invalidResponse")
      const detected = (data as { detectedLanguage?: { language?: unknown } })
        .detectedLanguage?.language
      return {
        texts: [translated],
        ...(typeof detected === "string" ? { detected } : {}),
      }
    },
  }
}
