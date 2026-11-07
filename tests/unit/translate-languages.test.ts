import { describe, expect, test } from "vitest"
import {
  canonicalLanguage,
  commonTranslateLanguages,
  defaultTargetLanguage,
  isTranslateLanguage,
  languageName,
  libreLanguage,
  sortedTranslateLanguages,
  translateLanguages,
} from "@/lib/translate/languages"

describe("translate language catalogue", () => {
  test("membership is closed over the fixed list", () => {
    for (const language of translateLanguages)
      expect(isTranslateLanguage(language)).toBe(true)
    expect(translateLanguages).not.toContain("auto")
    expect(isTranslateLanguage("auto")).toBe(false)
    expect(isTranslateLanguage("xx")).toBe(false)
    expect(isTranslateLanguage(null)).toBe(false)
  })

  test("browser tags collapse onto canonical tags", () => {
    expect(canonicalLanguage("zh-CN")).toBe("zh")
    expect(canonicalLanguage("zh-Hans")).toBe("zh")
    expect(canonicalLanguage("zh-TW")).toBe("zh-Hant")
    expect(canonicalLanguage("zh-HK")).toBe("zh-Hant")
    expect(canonicalLanguage("pt_BR")).toBe("pt")
    expect(canonicalLanguage("he-IL")).toBe("iw")
    expect(canonicalLanguage("nb-NO")).toBe("no")
    expect(canonicalLanguage("fr-FR")).toBe("fr")
    expect(canonicalLanguage("unknown")).toBeNull()
    expect(defaultTargetLanguage("zh-CN")).toBe("zh")
    expect(defaultTargetLanguage("zh-TW")).toBe("zh-Hant")
    expect(defaultTargetLanguage("en-US")).toBe("en")
    expect(defaultTargetLanguage("unknown")).toBe("en")
  })

  test("LibreTranslate uses lowercase tags and zt for Traditional Chinese", () => {
    expect(libreLanguage("zh-Hant")).toBe("zt")
    expect(libreLanguage("zh")).toBe("zh")
    expect(libreLanguage("EN")).toBe("en")
    expect(libreLanguage("auto")).toBe("auto")
  })

  test("UI language order is localized while the common pair stays first", () => {
    expect(commonTranslateLanguages).toEqual(["zh", "en"])
    const sorted = sortedTranslateLanguages("en")
    expect(sorted).toHaveLength(translateLanguages.length)
    expect(new Set(sorted)).toEqual(new Set(translateLanguages))
    const collator = new Intl.Collator("en", { sensitivity: "base" })
    for (let index = 1; index < sorted.length; index += 1)
      expect(
        collator.compare(
          languageName(sorted[index - 1], "en"),
          languageName(sorted[index], "en")
        )
      ).toBeLessThanOrEqual(0)
  })

  test("display names come from Intl with the raw tag as fallback", () => {
    expect(languageName("en", "en")).toBe("English")
    expect(languageName("zh-Hant", "zh-CN")).not.toBe("zh-Hant")
    expect(languageName("xx", "en")).toBe("xx")
    expect(languageName("not a language", "en")).toBe("not a language")
  })
})
