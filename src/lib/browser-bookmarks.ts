import { i18n } from "@/i18n"
import type { BookmarkBar, ImportedBookmark } from "./bookmark-import"

export type BrowserBookmarkNode = {
  id: string
  title: string
  url?: string
  children?: BrowserBookmarkNode[]
}
type BookmarkApi = {
  permissions?: {
    request(options: { permissions: string[] }): Promise<boolean>
  }
  bookmarks?: { getTree(): Promise<BrowserBookmarkNode[]> }
}
const browserApi = () =>
  (globalThis as typeof globalThis & { chrome?: BookmarkApi }).chrome

export const supportsBrowserBookmarks = () =>
  location.protocol === "chrome-extension:" &&
  typeof browserApi()?.permissions?.request === "function"

const untitledFolder = () => i18n.t("grid.quickAdd.untitledFolder")

export function parseBookmarkTree(tree: BrowserBookmarkNode[]) {
  const bookmarks: ImportedBookmark[] = []
  const bars: BookmarkBar[] = []
  let invalid = 0
  for (const root of tree) {
    for (const bar of root.children ?? []) {
      const barTitle = bar.title.trim() || untitledFolder()
      bars.push({ id: bar.id, title: barTitle })
      const stack = (bar.children ?? [])
        .map((node) => ({ node, path: [] as string[], parentId: bar.id }))
        .reverse()
      while (stack.length) {
        const { node, path, parentId } = stack.pop()!
        if (node.url !== undefined) {
          try {
            const url = new URL(node.url)
            if (!["http:", "https:"].includes(url.protocol)) {
              invalid++
              continue
            }
            bookmarks.push({
              name: node.title.trim() || url.hostname,
              url: url.href,
              folder: [barTitle, ...path].join(" / "),
              barId: bar.id,
              barTitle,
              folderId: parentId,
              folderPath: path,
            })
          } catch {
            invalid++
          }
          continue
        }
        const title = node.title.trim() || untitledFolder()
        const nextPath = [...path, title]
        for (let i = (node.children?.length ?? 0) - 1; i >= 0; i--)
          stack.push({
            node: node.children![i],
            path: nextPath,
            parentId: node.id,
          })
      }
    }
  }
  return { bookmarks, bars, invalid }
}

export type BrowserBookmarkData = ReturnType<typeof parseBookmarkTree>

export async function readBrowserBookmarks() {
  if (!supportsBrowserBookmarks())
    throw new Error(i18n.t("settings.bookmarkImport.infoUnsupported"))
  // Request directly from the click handler to preserve the user gesture.
  const granted = await browserApi()!.permissions!.request({
    permissions: ["bookmarks"],
  })
  if (!granted)
    throw new Error(i18n.t("settings.bookmarkImport.permissionDenied"))
  const bookmarks = browserApi()?.bookmarks
  if (!bookmarks?.getTree)
    throw new Error(i18n.t("settings.bookmarkImport.unavailable"))
  return parseBookmarkTree(await bookmarks.getTree())
}
