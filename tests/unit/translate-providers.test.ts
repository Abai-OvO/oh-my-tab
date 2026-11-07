import { afterEach, describe, expect, test, vi } from "vitest"
import { createChromeProvider } from "@/lib/translate/chrome-builtin"
import { createCustomProvider } from "@/lib/translate/custom"
import { createLibreProvider } from "@/lib/translate/libre"
import type { TranslateProvider } from "@/lib/translate/types"

function request(to = "zh") {
  return {
    texts: ["Hello"],
    from: "auto",
    to,
    signal: new AbortController().signal,
  }
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function customProvider(key = "secret") {
  return createCustomProvider("https://translate.example.com/api", key)
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe("custom translation endpoint", () => {
  test("posts the KISS v2 single-text body with a bearer token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ text: "你好", src: "en" }))
    vi.stubGlobal("fetch", fetchMock)
    const provider = customProvider()
    const result = await provider.translate(request())

    expect(result).toEqual({ texts: ["你好"], detected: "en" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("https://translate.example.com/api")
    expect(init?.method).toBe("POST")
    expect(init?.credentials).toBe("omit")
    expect(init?.referrerPolicy).toBe("no-referrer")
    expect(init?.redirect).toBe("error")
    expect(init?.cache).toBe("no-store")
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer secret",
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "Hello",
      from: "auto",
      to: "zh",
    })
  })

  test("does not send an authorization header without a key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ text: "你好" }))
    vi.stubGlobal("fetch", fetchMock)
    await customProvider("").translate(request())
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<
      string,
      string
    >
    expect(headers.Authorization).toBeUndefined()
  })

  test("rejects malformed and unsupported payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not-json", { status: 200 }))
    )
    await expectCode(customProvider().translate(request()), "invalidResponse")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ text: 42 }))
    )
    await expectCode(customProvider().translate(request()), "invalidResponse")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ message: "nope" }))
    )
    await expectCode(customProvider().translate(request()), "invalidResponse")
  })

  test("requires configuration and rejects batch payloads", async () => {
    expect(() => createCustomProvider("", "")).toThrowError(
      expect.objectContaining({ code: "notConfigured" })
    )
    const provider = customProvider()
    await expectCode(
      provider.translate({ ...request(), texts: ["a", "b"] }),
      "invalidResponse"
    )
    await expectCode(
      provider.translate({ ...request(), texts: ["  "] }),
      "emptyInput"
    )
  })
})

describe("LibreTranslate endpoint", () => {
  test("form-encodes the request and reads detectedLanguage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        translatedText: "您好",
        detectedLanguage: { language: "en", confidence: 95 },
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    const provider = createLibreProvider(
      "https://libre.example.com/",
      "api-key"
    )
    const result = await provider.translate(request("zh-Hant"))

    expect(result).toEqual({ texts: ["您好"], detected: "en" })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("https://libre.example.com/translate")
    expect(init?.method).toBe("POST")
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/x-www-form-urlencoded",
    })
    const body = new URLSearchParams(String(init?.body))
    expect(body.get("q")).toBe("Hello")
    expect(body.get("source")).toBe("auto")
    expect(body.get("target")).toBe("zt")
    expect(body.get("format")).toBe("text")
    expect(body.get("api_key")).toBe("api-key")
  })

  test("accepts a host with a path and omits an empty API key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ translatedText: "Bonjour" }))
    vi.stubGlobal("fetch", fetchMock)
    await createLibreProvider("https://libre.example.com/api", "").translate(
      request("fr")
    )
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://libre.example.com/api/translate"
    )
    const body = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body))
    expect(body.has("api_key")).toBe(false)
  })

  test("rejects a malformed response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ translatedText: null }))
    )
    await expectCode(
      createLibreProvider("https://libre.example.com", "").translate(request()),
      "invalidResponse"
    )
  })
})

describe("translation HTTP status mapping", () => {
  const cases: [number, string, string][] = [
    [401, "key", "authFailed"],
    [403, "key", "authFailed"],
    [403, "", "rateLimited"],
    [402, "key", "quotaExceeded"],
    [429, "key", "rateLimited"],
    [500, "key", "requestFailed"],
  ]

  test.each(cases)(
    "status %s with key %s maps to %s",
    async (status, key, code) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("", { status }))
      )
      await expectCode(customProvider(key).translate(request()), code)
    }
  )
})

describe("request aborts", () => {
  test("propagate AbortError instead of becoming a provider failure", async () => {
    const fetchMock = vi.fn().mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          )
        })
    )
    vi.stubGlobal("fetch", fetchMock)
    const controller = new AbortController()
    const provider: TranslateProvider = customProvider()
    const pending = provider.translate({
      ...request(),
      signal: controller.signal,
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
  })
})

describe("Chrome provider feature detection", () => {
  test("reports unsupported and no auto-detect when the APIs are absent", async () => {
    const provider = createChromeProvider()
    expect(provider.supportsAuto()).toBe(false)
    await expect(provider.availability({ from: "en", to: "zh" })).resolves.toBe(
      "unsupported"
    )
  })
})
