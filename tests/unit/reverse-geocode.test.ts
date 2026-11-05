import { afterEach, expect, test, vi } from "vitest"
import { reverseGeocode } from "@/lib/widgets/reverse-geocode"

function json(value: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    })
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

test("prefers the city name and requests the active language", async () => {
  const fetch = vi.fn((input: URL) => {
    expect(input.origin).toBe("https://api-bdc.io")
    expect(input.pathname).toBe("/data/reverse-geocode-client")
    expect(input.searchParams.get("latitude")).toBe("31.2304")
    expect(input.searchParams.get("longitude")).toBe("121.4737")
    expect(input.searchParams.get("localityLanguage")).toBe("zh")
    return json({ city: "上海市", locality: "黃浦區" })
  })
  vi.stubGlobal("fetch", fetch)
  await expect(
    reverseGeocode(31.2304, 121.4737, "zh-CN", new AbortController().signal)
  ).resolves.toBe("上海市")
})

test("falls back to the district and province when the city is missing", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => json({ locality: "黄浦区", principalSubdivision: "上海市" }))
  )
  await expect(
    reverseGeocode(31.2304, 121.4737, "en", new AbortController().signal)
  ).resolves.toBe("黄浦区")
})

test("returns null when the lookup is rejected or empty", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response("", { status: 402 })))
  )
  await expect(
    reverseGeocode(31.2304, 121.4737, "zh", new AbortController().signal)
  ).resolves.toBeNull()

  vi.stubGlobal(
    "fetch",
    vi.fn(() => json({}))
  )
  await expect(
    reverseGeocode(31.2304, 121.4737, "zh", new AbortController().signal)
  ).resolves.toBeNull()
})
