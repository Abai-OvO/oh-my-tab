import { remoteUrl } from "@/lib/widgets/model"
import { postWidgetJson } from "@/lib/widgets/network"
import { mapTranslateNetworkError, TranslateError } from "./errors"
import {
  TRANSLATE_MAX_CHARS,
  type TranslateProvider,
  type TranslateRequest,
} from "./types"

export function createCustomProvider(
  endpointUrl: string,
  apiKey: string
): TranslateProvider {
  const endpoint = remoteUrl(endpointUrl.trim())
  if (!endpoint) throw new TranslateError("notConfigured")
  const key = apiKey.trim()

  return {
    id: "custom",
    maxChars: TRANSLATE_MAX_CHARS,
    supportsAuto: () => true,
    availability: async () => "available",
    async translate(request: TranslateRequest) {
      if (request.texts.length !== 1)
        throw new TranslateError("invalidResponse")
      const text = request.texts[0]
      if (!text.trim()) throw new TranslateError("emptyInput")
      let payload: string
      try {
        payload = await postWidgetJson(
          endpoint,
          { text, from: request.from, to: request.to },
          request.signal,
          key ? { Authorization: `Bearer ${key}` } : {}
        )
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
      const translated = (data as { text?: unknown }).text
      if (typeof translated !== "string")
        throw new TranslateError("invalidResponse")
      const detected = (data as { src?: unknown }).src
      return {
        texts: [translated],
        ...(typeof detected === "string" && detected !== "auto"
          ? { detected }
          : {}),
      }
    },
  }
}
