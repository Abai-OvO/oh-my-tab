import { describe, expect, it } from "vitest"
import { commonSiteCategories, commonSites } from "@/lib/common-sites"
import { normalizeTabUrl } from "@/lib/grid/types"
import enGrid from "@/i18n/locales/en/grid"
import zhGrid from "@/i18n/locales/zh-CN/grid"

function label(grid: object, key: string) {
  return key
    .split(".")
    .slice(1)
    .reduce<unknown>(
      (value, part) => (value as Record<string, unknown> | undefined)?.[part],
      grid
    )
}

describe("common sites", () => {
  it("keeps preset ids and URLs unique and valid", () => {
    expect(new Set(commonSites.map((site) => site.id)).size).toBe(
      commonSites.length
    )
    expect(new Set(commonSites.map((site) => site.url)).size).toBe(
      commonSites.length
    )
    for (const site of commonSites) {
      expect(normalizeTabUrl(site.url)).not.toBeNull()
      expect(site.initial).toHaveLength(1)
    }
  })

  it("labels every preset in both languages", () => {
    for (const site of commonSites) {
      expect(typeof label(zhGrid, site.labelKey)).toBe("string")
      expect(typeof label(enGrid, site.labelKey)).toBe("string")
    }
  })

  it("keeps categories and hot presets consistent", () => {
    const categories = new Set([
      "search",
      "social",
      "video",
      "dev",
      "ai",
      "read",
      "shop",
      "tool",
    ])
    expect(commonSites).toHaveLength(26)
    expect(commonSites.filter((site) => site.hot)).toHaveLength(6)
    for (const site of commonSites) {
      expect(categories.has(site.category)).toBe(true)
    }
    for (const category of commonSiteCategories) {
      expect(typeof label(zhGrid, `grid.quickAdd.categories.${category}`)).toBe(
        "string"
      )
      expect(typeof label(enGrid, `grid.quickAdd.categories.${category}`)).toBe(
        "string"
      )
    }
  })
})
