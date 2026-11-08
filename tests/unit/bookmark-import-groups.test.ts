import { describe, expect, it } from "vitest"
import {
  barOptions,
  filterBookmarks,
  groupBookmarks,
  uniqueBookmarksByUrl,
  type ImportedBookmark,
} from "@/lib/bookmark-import"

const bookmarks: ImportedBookmark[] = [
  {
    name: "周报",
    url: "https://work.example/weekly",
    folder: "书签栏 / 工作",
    barId: "1",
    barTitle: "书签栏",
    folderId: "10",
    folderPath: ["工作"],
  },
  {
    name: "Figma",
    url: "https://figma.example/",
    folder: "书签栏 / 工作 / 设计",
    barId: "1",
    barTitle: "书签栏",
    folderId: "11",
    folderPath: ["工作", "设计"],
  },
  {
    name: "React",
    url: "https://react.example/",
    folder: "书签栏 / 开发",
    barId: "1",
    barTitle: "书签栏",
    folderId: "12",
    folderPath: ["开发"],
  },
  {
    name: "GitHub",
    url: "https://github.example/",
    folder: "书签栏",
    barId: "1",
    barTitle: "书签栏",
    folderId: "1",
    folderPath: [],
  },
  {
    name: "淘宝",
    url: "https://taobao.example/",
    folder: "其他书签 / 购物",
    barId: "2",
    barTitle: "其他书签",
    folderId: "20",
    folderPath: ["购物"],
  },
  {
    name: "React 重复",
    url: "https://react.example/",
    folder: "其他书签 / 临时",
    barId: "2",
    barTitle: "其他书签",
    folderId: "21",
    folderPath: ["临时"],
  },
  {
    name: "12306",
    url: "https://12306.example/",
    folder: "其他书签 / 临时",
    barId: "2",
    barTitle: "其他书签",
    folderId: "21",
    folderPath: ["临时"],
  },
]

const bars = [
  { id: "1", title: "书签栏" },
  { id: "2", title: "其他书签" },
  { id: "3", title: "移动设备书签" },
]

describe("bookmark grouping", () => {
  it("deduplicates URLs globally and keeps the first folder", () => {
    const unique = uniqueBookmarksByUrl(bookmarks)
    expect(unique).toHaveLength(6)
    const react = unique.find((bookmark) => bookmark.name === "React")
    expect(react?.folderPath).toEqual(["开发"])
    expect(unique.some((bookmark) => bookmark.folderPath?.[0] === "临时")).toBe(
      true
    )
    expect(
      unique.filter((bookmark) => bookmark.url === "https://react.example/")
    ).toHaveLength(1)
  })

  it("counts unique bookmarks per browser bar and hides empty bars", () => {
    const unique = uniqueBookmarksByUrl(bookmarks)
    expect(barOptions(bars, unique)).toEqual([
      { id: "1", title: "书签栏", count: 4 },
      { id: "2", title: "其他书签", count: 2 },
    ])
  })

  it("groups the all view by bar and full folder path", () => {
    const groups = groupBookmarks(uniqueBookmarksByUrl(bookmarks), "all")
    expect(groups.map((group) => group.label)).toEqual([
      "书签栏 / 工作",
      "书签栏 / 工作 / 设计",
      "书签栏 / 开发",
      "书签栏",
      "其他书签 / 购物",
      "其他书签 / 临时",
    ])
    expect(groups.map((group) => group.bookmarks.length)).toEqual([
      1, 1, 1, 1, 1, 1,
    ])
  })

  it("groups a selected bar by relative folder path", () => {
    const groups = groupBookmarks(uniqueBookmarksByUrl(bookmarks), "1")
    expect(groups.map((group) => group.label)).toEqual([
      "工作",
      "工作 / 设计",
      "开发",
      "书签栏",
    ])
  })

  it("searches bar names and nested folder paths", () => {
    const unique = uniqueBookmarksByUrl(bookmarks)
    expect(
      filterBookmarks(unique, "设计").map((bookmark) => bookmark.name)
    ).toEqual(["Figma"])
    expect(
      filterBookmarks(unique, "开发").map((bookmark) => bookmark.name)
    ).toEqual(["React"])
    expect(
      filterBookmarks(unique, "其他书签").map((bookmark) => bookmark.name)
    ).toEqual(["淘宝", "12306"])
  })
})
