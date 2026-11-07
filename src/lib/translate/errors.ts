import { WidgetNetworkError } from "@/lib/widgets/errors"

export type TranslateErrorCode =
  | "notConfigured"
  | "permissionDenied"
  | "authFailed"
  | "quotaExceeded"
  | "rateLimited"
  | "requestFailed"
  | "responseTooLarge"
  | "invalidResponse"
  | "unsupportedPair"
  | "modelMissing"
  | "emptyInput"

export class TranslateError extends Error {
  readonly code: TranslateErrorCode

  constructor(code: TranslateErrorCode) {
    super(code)
    this.code = code
    this.name = "TranslateError"
  }
}

/**
 * HTTP clients share their status with this layer so 401/403 with an API key
 * can stay an authentication error rather than a generic rate limit.
 */
export function mapTranslateNetworkError(
  error: unknown,
  hasKey = false
): TranslateError {
  if (error instanceof TranslateError) return error
  if (error instanceof WidgetNetworkError) {
    if (error.status === 401)
      return new TranslateError(hasKey ? "authFailed" : "requestFailed")
    if (error.status === 403)
      return new TranslateError(hasKey ? "authFailed" : "rateLimited")
    if (error.status === 402) return new TranslateError("quotaExceeded")
    if (error.status === 429) return new TranslateError("rateLimited")
    switch (error.code) {
      case "notConfigured":
        return new TranslateError("notConfigured")
      case "permissionDenied":
        return new TranslateError("permissionDenied")
      case "authFailed":
        return new TranslateError("authFailed")
      case "quotaExceeded":
        return new TranslateError("quotaExceeded")
      case "rateLimited":
        return new TranslateError("rateLimited")
      case "responseTooLarge":
        return new TranslateError("responseTooLarge")
      case "invalidResponse":
        return new TranslateError("invalidResponse")
      case "requestFailed":
        return new TranslateError("requestFailed")
    }
  }
  return new TranslateError("requestFailed")
}
