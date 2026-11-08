import { describe, expect, test } from "vitest"
import {
  isIconOnlyTabSize,
  packFolderRows,
  tabRowUnits,
} from "@/components/tab-grid/tab-size"
import type { TabEntry } from "@/lib/grid/types"

function tab(id: string, size?: TabEntry["size"]): TabEntry {
  return { id, name: id, url: `https://${id}.example/`, size }
}

describe("folder tab rows", () => {
  test("row units follow the tab grid width", () => {
    expect(tabRowUnits(undefined)).toBe(4)
    expect(tabRowUnits("square-small")).toBe(1)
    expect(tabRowUnits("compact")).toBe(2)
    expect(tabRowUnits("small")).toBe(4)
    expect(tabRowUnits("medium")).toBe(4)
    expect(tabRowUnits("square-medium")).toBe(4)
    expect(tabRowUnits("square-large")).toBe(4)
  })

  test("only 1×1 tabs render icon-only", () => {
    expect(isIconOnlyTabSize("square-small")).toBe(true)
    expect(isIconOnlyTabSize("compact")).toBe(false)
    expect(isIconOnlyTabSize("small")).toBe(false)
  })

  test("packs tabs into lines without splitting one", () => {
    const tabs = [
      tab("a", "square-small"),
      tab("b", "square-small"),
      tab("c", "compact"),
      tab("d"),
      tab("e", "square-small"),
    ]
    expect(
      packFolderRows(tabs, 4).map((line) => line.map((entry) => entry.id))
    ).toEqual([["a", "b", "c"], ["d"], ["e"]])
  })

  test("a line holds four 1×1 or two 2×1 tabs", () => {
    const tabs = [
      tab("a", "square-small"),
      tab("b", "square-small"),
      tab("c", "square-small"),
      tab("d", "square-small"),
      tab("e", "compact"),
      tab("f", "compact"),
    ]
    expect(
      packFolderRows(tabs, 4).map((line) => line.map((entry) => entry.id))
    ).toEqual([
      ["a", "b", "c", "d"],
      ["e", "f"],
    ])
  })

  test("oversized tabs still occupy their own line", () => {
    const tabs = [tab("a"), tab("b", "square-large"), tab("c", "compact")]
    expect(
      packFolderRows(tabs, 4).map((line) => line.map((entry) => entry.id))
    ).toEqual([["a"], ["b"], ["c"]])
  })
})
