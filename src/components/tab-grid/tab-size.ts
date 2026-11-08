import type { TabEntry, TabItem } from "@/lib/grid/types"

/** 1×1 tabs render a centered icon instead of the wide row layout. */
export function isIconOnlyTabSize(size: TabItem["size"]) {
  return size === "square-small"
}

/** How many of the four row columns a folder tab occupies. */
export function tabRowUnits(size: TabEntry["size"] | undefined) {
  if (size === "square-small") return 1
  if (size === "compact") return 2
  return 4
}

/**
 * Packs folder tabs into lines whose total units stay within `lineUnits`.
 * Tabs keep their grid width: four 1×1 tabs, or two 2×1 tabs, fit one line.
 */
export function packFolderRows(tabs: TabEntry[], lineUnits: number) {
  const lines: TabEntry[][] = []
  let line: TabEntry[] = []
  let used = 0
  for (const tab of tabs) {
    const units = tabRowUnits(tab.size)
    if (line.length && used + units > lineUnits) {
      lines.push(line)
      line = []
      used = 0
    }
    line.push(tab)
    used += units
  }
  if (line.length) lines.push(line)
  return lines
}
