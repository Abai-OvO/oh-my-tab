export type WidgetNetworkErrorCode =
  | "notConfigured"
  | "permissionDenied"
  | "authFailed"
  | "quotaExceeded"
  | "requestFailed"
  | "rateLimited"
  | "responseTooLarge"
  | "invalidResponse"

export class WidgetNetworkError extends Error {
  readonly code: WidgetNetworkErrorCode
  /** HTTP status when the request reached a server; absent for local errors. */
  readonly status?: number

  constructor(code: WidgetNetworkErrorCode, status?: number) {
    super(code)
    this.code = code
    this.status = status
    this.name = "WidgetNetworkError"
  }
}
