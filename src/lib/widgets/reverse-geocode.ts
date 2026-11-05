// BigDataCloud's older api.bigdatacloud.net host now redirects here. Use the
// canonical host directly so the request keeps redirect: "error".
export const REVERSE_GEOCODE_HOST = "https://api-bdc.io"

/**
 * Keyless client-side reverse geocoding for "use my location". It is only
 * called with device coordinates the user just requested. Any failure returns
 * null so the caller can keep the generic "Current location" label.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  language: string,
  signal: AbortSignal
): Promise<string | null> {
  const url = new URL("/data/reverse-geocode-client", REVERSE_GEOCODE_HOST)
  url.search = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    localityLanguage: language.toLowerCase().startsWith("zh") ? "zh" : "en",
  }).toString()
  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })
    if (!response.ok) {
      await response.body?.cancel()
      return null
    }
    const data = (await response.json()) as unknown
    if (!data || typeof data !== "object" || Array.isArray(data)) return null
    const record = data as Record<string, unknown>
    for (const key of [
      "city",
      "locality",
      "principalSubdivision",
      "countryName",
    ]) {
      const value = record[key]
      if (typeof value === "string" && value.trim())
        return value.trim().slice(0, 40)
    }
    return null
  } catch {
    return null
  }
}
