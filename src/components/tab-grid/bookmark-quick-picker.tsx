import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowClockwise, MagnifyingGlass } from "@phosphor-icons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  barOptions,
  filterBookmarks,
  groupBookmarks,
  uniqueBookmarksByUrl,
} from "@/lib/bookmark-import"
import type { BrowserBookmarkData } from "@/lib/browser-bookmarks"
import { cn } from "@/lib/utils"
import { sourceHost } from "@/lib/widgets/presentation"
import TabIcon from "./tab-icon"

export type BookmarkStatus = "idle" | "loading" | "ready" | "error"

export default function BookmarkQuickPicker({
  data,
  status,
  error,
  supported,
  onRetry,
  onSelect,
}: {
  data: BrowserBookmarkData | null
  status: BookmarkStatus
  error: string
  supported: boolean
  onRetry: () => void
  onSelect: (entry: { name: string; url: string }) => void
}) {
  const { t } = useTranslation()
  const [barId, setBarId] = useState("all")
  const [query, setQuery] = useState("")
  const bookmarks = useMemo(
    () => uniqueBookmarksByUrl(data?.bookmarks ?? []),
    [data]
  )
  const bars = useMemo(
    () => barOptions(data?.bars ?? [], bookmarks),
    [data, bookmarks]
  )
  const effectiveBarId =
    barId === "all" || bars.some((bar) => bar.id === barId) ? barId : "all"
  const filtered = useMemo(() => {
    const byQuery = filterBookmarks(bookmarks, query)
    return effectiveBarId === "all"
      ? byQuery
      : byQuery.filter((bookmark) => bookmark.barId === effectiveBarId)
  }, [bookmarks, effectiveBarId, query])
  const groups = useMemo(
    () => groupBookmarks(filtered, effectiveBarId),
    [filtered, effectiveBarId]
  )
  const total = bookmarks.length
  const activeBar = bars.find((bar) => bar.id === effectiveBarId)
  const countLabel = query.trim()
    ? t("grid.quickAdd.bookmarkResults", { count: filtered.length })
    : effectiveBarId !== "all"
      ? t("grid.quickAdd.bookmarkBarCount", {
          bar: activeBar?.title ?? "",
          count: filtered.length,
        })
      : t("grid.quickAdd.bookmarkCount", { count: total })
  const hint =
    filtered.length === 0
      ? t("grid.quickAdd.tryOther")
      : filtered.length > 6
        ? t("grid.quickAdd.scrollHint")
        : t("grid.quickAdd.bookmarkHint")

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative flex-none">
        <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          aria-label={t("grid.quickAdd.searchBookmarks")}
          placeholder={t("grid.quickAdd.searchBookmarks")}
          className="h-9 pl-9"
          onChange={(event) => {
            const value = event.target.value
            setQuery(value)
            if (value.trim()) setBarId("all")
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            const first = groups[0]?.bookmarks[0]
            if (first) onSelect({ name: first.name, url: first.url })
          }}
        />
      </div>
      {status === "loading" || status === "idle" ? (
        <p
          role="status"
          className="py-10 text-center text-sm text-muted-foreground"
        >
          {t("grid.quickAdd.bookmarksLoading")}
        </p>
      ) : status === "error" ? (
        <div
          role="alert"
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-8 text-center"
        >
          <p className="max-w-sm text-sm leading-relaxed text-destructive">
            {error}
          </p>
          {supported && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              {t("grid.quickAdd.retry")}
            </Button>
          )}
        </div>
      ) : total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {t("grid.quickAdd.bookmarksEmpty")}
        </p>
      ) : (
        <>
          <div className="flex flex-none items-center gap-2">
            <div
              role="group"
              aria-label={t("grid.quickAdd.bookmarksTab")}
              className="flex min-w-0 flex-1 [scrollbar-width:none] gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden"
            >
              <button
                type="button"
                aria-pressed={effectiveBarId === "all"}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  effectiveBarId === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  setBarId("all")
                  setQuery("")
                }}
              >
                {t("grid.quickAdd.categories.all")}
                <span className="opacity-70">{total}</span>
              </button>
              {bars.map((bar) => (
                <button
                  key={bar.id}
                  type="button"
                  aria-pressed={effectiveBarId === bar.id}
                  className={cn(
                    "flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    effectiveBarId === bar.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                  onClick={() => {
                    setBarId(bar.id)
                    setQuery("")
                  }}
                >
                  <span className="max-w-40 truncate" title={bar.title}>
                    {bar.title}
                  </span>
                  <span className="opacity-70">{bar.count}</span>
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t("grid.quickAdd.bookmarksRefresh")}
              title={t("grid.quickAdd.bookmarksRefresh")}
              onClick={onRetry}
            >
              <ArrowClockwise />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {groups.length > 0 ? (
              groups.map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <p className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/60 bg-popover px-2 py-1.5 text-xs font-medium">
                    <span className="truncate" title={group.label}>
                      {group.label}
                    </span>
                    <span className="shrink-0 font-normal text-muted-foreground">
                      {group.bookmarks.length}
                    </span>
                  </p>
                  {group.bookmarks.map((bookmark) => (
                    <button
                      key={`${bookmark.barId ?? ""}-${bookmark.folderId ?? ""}-${bookmark.url}`}
                      type="button"
                      title={`${bookmark.name} · ${bookmark.url}`}
                      className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-xl px-2 py-1 text-left transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() =>
                        onSelect({ name: bookmark.name, url: bookmark.url })
                      }
                    >
                      <TabIcon
                        url={bookmark.url}
                        className="size-6 rounded-lg"
                        fallback={
                          <span
                            aria-hidden="true"
                            className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-semibold text-primary"
                          >
                            {bookmark.name.slice(0, 1).toUpperCase()}
                          </span>
                        }
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {bookmark.name}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {sourceHost(bookmark.url)}
                        </span>
                      </span>
                    </button>
                  ))}
                </section>
              ))
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">
                {t("grid.quickAdd.bookmarkNoMatch")}
              </p>
            )}
          </div>
          <div
            aria-live="polite"
            className="flex flex-none flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground"
          >
            <span>{countLabel}</span>
            <span>{hint}</span>
          </div>
        </>
      )}
    </div>
  )
}
