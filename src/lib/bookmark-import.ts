import type { FolderItem, GridItem, TabItem } from "@/lib/grid/types"

export type ImportedBookmark = {
  name: string
  url: string
  folder: string
  barId?: string
  barTitle?: string
  folderId?: string
  folderPath?: string[]
}
export type BookmarkBar = { id: string; title: string }
export type BookmarkGroup = {
  key: string
  label: string
  barId: string
  barTitle: string
  folderPath: string[]
  bookmarks: ImportedBookmark[]
}
export type BookmarkItemFactory = {
  createTab: (input: { name: string; url: string }) => TabItem
  createFolder: (input: { name: string; tabs: TabItem[] }) => FolderItem
}
export function uniqueBookmarksByUrl(
  bookmarks: ImportedBookmark[]
): ImportedBookmark[] {
  const seen = new Set<string>()
  return bookmarks.filter((bookmark) => {
    if (seen.has(bookmark.url)) return false
    seen.add(bookmark.url)
    return true
  })
}
export function filterBookmarks(
  bookmarks: ImportedBookmark[],
  query: string
): ImportedBookmark[] {
  const term = query.trim().toLowerCase()
  if (!term) return bookmarks
  return bookmarks.filter((bookmark) =>
    [
      bookmark.name,
      bookmark.url,
      bookmark.folder,
      bookmark.barTitle ?? "",
      (bookmark.folderPath ?? []).join(" / "),
    ]
      .join("\n")
      .toLowerCase()
      .includes(term)
  )
}
export function barOptions(
  bars: BookmarkBar[],
  bookmarks: ImportedBookmark[]
): { id: string; title: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const bookmark of bookmarks) {
    if (!bookmark.barId) continue
    counts.set(bookmark.barId, (counts.get(bookmark.barId) ?? 0) + 1)
  }
  return bars
    .map((bar) => ({
      id: bar.id,
      title: bar.title,
      count: counts.get(bar.id) ?? 0,
    }))
    .filter((bar) => bar.count > 0)
}
export function groupBookmarks(
  bookmarks: ImportedBookmark[],
  barId: string
): BookmarkGroup[] {
  const groups = new Map<string, BookmarkGroup>()
  const pool =
    barId === "all"
      ? bookmarks
      : bookmarks.filter((bookmark) => bookmark.barId === barId)
  for (const bookmark of pool) {
    const bookmarkBarId = bookmark.barId ?? ""
    const folderPath = bookmark.folderPath ?? []
    const barTitle = bookmark.barTitle ?? bookmark.folder
    const key = `${bookmarkBarId}\u0000${folderPath.join("\u0000")}`
    let group = groups.get(key)
    if (!group) {
      const relative = folderPath.join(" / ")
      group = {
        key,
        label:
          barId === "all"
            ? [barTitle, relative].filter(Boolean).join(" / ")
            : relative || barTitle,
        barId: bookmarkBarId,
        barTitle,
        folderPath,
        bookmarks: [],
      }
      groups.set(key, group)
    }
    group.bookmarks.push(bookmark)
  }
  return [...groups.values()]
}
export function mergeBookmarks(
  existing: GridItem[],
  bookmarks: ImportedBookmark[],
  factory: BookmarkItemFactory
) {
  const items = [...existing]
  const seen = new Set(
    existing
      .flatMap((item) =>
        item.kind === "tab"
          ? [item.url]
          : item.kind === "folder"
            ? item.tabs.map((tab) => tab.url)
            : []
      )
      .map((url) => new URL(url).href)
  )
  let added = 0
  let duplicates = 0
  for (const entry of bookmarks) {
    if (seen.has(entry.url)) {
      duplicates++
      continue
    }
    seen.add(entry.url)
    const tab = factory.createTab({
      name: entry.name,
      url: entry.url,
    })
    if (!entry.folder) items.push(tab)
    else {
      const index = items.findIndex(
        (item) => item.kind === "folder" && item.name === entry.folder
      )
      const folder = items[index]
      if (folder?.kind === "folder")
        items[index] = {
          ...folder,
          tabs: [...folder.tabs, tab],
          dynamicEffect: tab.dynamicEffect || folder.dynamicEffect,
        }
      else
        items.push(
          factory.createFolder({
            name: entry.folder,
            tabs: [tab],
          })
        )
    }
    added++
  }
  return { items, added, duplicates }
}
