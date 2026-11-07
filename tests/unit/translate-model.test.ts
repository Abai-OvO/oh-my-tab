import { describe, expect, test } from "vitest"
import { snapshot } from "@/application/config-transfer"
import { createCatalogComponent } from "@/lib/grid/factory"
import {
  componentRegistry,
  getComponentSizeOptions,
  getItemGridDimensions,
} from "@/lib/grid/registry"
import type { TranslateWidgetItem } from "@/lib/grid/utility-types"
import { validGridItem } from "@/lib/grid/validation"
import { defaultTargetLanguage } from "@/lib/translate/languages"
import { createUtilityWidget, validUtilityWidget } from "@/lib/widgets/model"
import { useTranslateStore } from "@/stores/translate-store"

const shared = {
  id: "translate",
  name: "Translate",
  color: "#5b8dd6",
  size: "small" as const,
}

const item = createUtilityWidget("translate", shared) as TranslateWidgetItem

describe("translate widget model", () => {
  test("creates one 1x1 icon tile with local defaults", () => {
    expect(item).toMatchObject({
      kind: "translate",
      provider: "chrome",
      sourceLang: "auto",
      targetLang: defaultTargetLanguage(),
      autoTranslate: false,
    })
    expect(validUtilityWidget(item)).toBe(true)
    expect(validGridItem(JSON.parse(JSON.stringify(item)))).toBe(true)
    expect(getItemGridDimensions(item)).toEqual({ width: 1, height: 1 })
    expect(
      getComponentSizeOptions("translate", "catalog").map(
        ({ width, height }) => [width, height]
      )
    ).toEqual([[1, 1]])
    expect(componentRegistry.translate).toMatchObject({
      defaultSize: "small",
      catalogSizes: ["small"],
      openAction: "none",
    })
    expect(componentRegistry.translate.sizes).toHaveLength(1)
    expect(componentRegistry.translate.actions.resize).toBe(false)
    expect(createCatalogComponent("translate")).toMatchObject({
      kind: "translate",
      size: "small",
    })
  })

  test("accepts every provider and canonical language", () => {
    for (const provider of ["chrome", "libre", "custom"] as const)
      expect(validUtilityWidget({ ...item, provider })).toBe(true)
    expect(validUtilityWidget({ ...item, provider: undefined })).toBe(true)
    expect(validUtilityWidget({ ...item, sourceLang: "zh-Hant" })).toBe(true)
    expect(validUtilityWidget({ ...item, targetLang: "zh-Hant" })).toBe(true)
    expect(validUtilityWidget({ ...item, autoTranslate: true })).toBe(true)
  })

  test("rejects unknown providers, languages and an auto target", () => {
    const invalid = [
      { ...item, provider: "bing" },
      { ...item, sourceLang: "xx" },
      { ...item, sourceLang: "auto" as const, targetLang: "auto" },
      { ...item, targetLang: "unknown" },
      { ...item, autoTranslate: "yes" },
      { ...item, sourceLang: 1 },
    ]
    for (const value of invalid)
      expect(validUtilityWidget(value as TranslateWidgetItem)).toBe(false)
  })

  test("keeps credentials out of the exported snapshot", () => {
    const previous = useTranslateStore.getState()
    useTranslateStore.setState({
      libreHost: "https://secret.libretranslate.example.com",
      libreApiKey: "super-secret-key",
      customUrl: "https://secret-translate.example.com/api",
      customApiKey: "another-secret-key",
    })
    try {
      const serialized = JSON.stringify(snapshot())
      expect(serialized).not.toContain("super-secret-key")
      expect(serialized).not.toContain("another-secret-key")
      expect(serialized).not.toContain("secret.libretranslate.example.com")
      expect(serialized).not.toContain("secret-translate.example.com")
    } finally {
      useTranslateStore.setState(previous)
    }
  })
})
