import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  BookmarkSimple,
  CaretDown,
  Sparkle,
  SquaresFour,
} from "@phosphor-icons/react"
import { surfaceShadowClassName } from "@/components/ui/surface-shadow"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  readBrowserBookmarks,
  supportsBrowserBookmarks,
  type BrowserBookmarkData,
} from "@/lib/browser-bookmarks"
import { cn } from "@/lib/utils"
import BookmarkQuickPicker, {
  type BookmarkStatus,
} from "./bookmark-quick-picker"
import CommonSitePicker from "./common-site-picker"

type QuickEntry = { name: string; url: string }
type Source = "sites" | "bookmarks"

export default function TabQuickAdd({
  onSelect,
}: {
  onSelect: (entry: QuickEntry) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<Source>("sites")
  const [bookmarkStatus, setBookmarkStatus] = useState<BookmarkStatus>("idle")
  const [bookmarkData, setBookmarkData] = useState<BrowserBookmarkData | null>(
    null
  )
  const [bookmarkError, setBookmarkError] = useState("")
  const triggerRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)
  const supported = supportsBrowserBookmarks()

  async function loadBookmarks(force = false) {
    if (loadingRef.current) return
    if (!force && bookmarkStatus === "ready") return
    if (!supported) {
      setBookmarkError(t("grid.quickAdd.bookmarksUnsupported"))
      setBookmarkStatus("error")
      return
    }
    loadingRef.current = true
    setBookmarkStatus("loading")
    setBookmarkError("")
    try {
      const parsed = await readBrowserBookmarks()
      setBookmarkData(parsed)
      setBookmarkStatus("ready")
    } catch (cause) {
      setBookmarkError(
        cause instanceof Error
          ? cause.message
          : t("grid.quickAdd.bookmarksFailed")
      )
      setBookmarkStatus("error")
    } finally {
      loadingRef.current = false
    }
  }

  function changeSource(next: Source) {
    if (next === source) return
    setSource(next)
    // Keep the permission request inside the tab click that triggers it.
    if (next === "bookmarks" && bookmarkStatus === "idle") void loadBookmarks()
  }

  function closeSheet(focusTrigger = true) {
    setOpen(false)
    if (focusTrigger) requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function choose(entry: QuickEntry) {
    onSelect(entry)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const sheet = sheetRef.current
    if (!sheet) return
    const element = sheet
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation()
        closeSheet()
        return
      }
      if (event.key !== "Tab") return
      const focusable = [
        ...element.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((node) => node.offsetParent !== null)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    sheet.addEventListener("keydown", onKeyDown)
    return () => sheet.removeEventListener("keydown", onKeyDown)
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="tab-quick-add-sheet"
        className={cn(
          "pointer-events-auto absolute top-3 left-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-full border border-black/10 bg-white/80 px-3 text-xs font-medium text-zinc-950 backdrop-blur-md transition-colors hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 dark:bg-zinc-900/80 dark:text-white dark:hover:bg-zinc-900/90",
          surfaceShadowClassName,
          open && "border-ring/50 ring-2 ring-ring/20"
        )}
        onClick={() => {
          if (open) closeSheet()
          else setOpen(true)
        }}
        onKeyDown={(event) => {
          // Escape on the trigger collapses the sheet before the dialog.
          if (open && event.key === "Escape") {
            event.stopPropagation()
            closeSheet()
          }
        }}
      >
        <Sparkle
          weight="fill"
          className="size-3.5 text-primary"
          aria-hidden="true"
        />
        {t("grid.quickAdd.trigger")}
        <CaretDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          ref={sheetRef}
          id="tab-quick-add-sheet"
          role="dialog"
          aria-label={t("grid.quickAdd.title")}
          className="pointer-events-auto absolute top-[52px] right-3 bottom-3 left-3 z-0 flex animate-in flex-col gap-3 overflow-hidden rounded-3xl border bg-popover p-3 text-popover-foreground shadow-xl duration-150 fade-in-0 zoom-in-95 motion-reduce:animate-none sm:right-4 sm:bottom-4 sm:left-4 sm:p-4"
        >
          <div className="flex flex-none flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-0.5">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Sparkle
                  weight="fill"
                  className="size-3.5 text-primary"
                  aria-hidden="true"
                />
                {t("grid.quickAdd.title")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("grid.quickAdd.description")}
              </p>
            </div>
            <ToggleGroup
              className="w-full sm:w-52"
              aria-label={t("grid.quickAdd.sourceLabel")}
              value={[source]}
              onValueChange={(values) => {
                const next = values[0]
                if (next === "sites" || next === "bookmarks") changeSource(next)
              }}
            >
              <ToggleGroupItem value="sites">
                <SquaresFour />
                {t("grid.quickAdd.sitesTab")}
              </ToggleGroupItem>
              <ToggleGroupItem value="bookmarks">
                <BookmarkSimple />
                {t("grid.quickAdd.bookmarksTab")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          {source === "sites" ? (
            <CommonSitePicker onSelect={choose} />
          ) : (
            <BookmarkQuickPicker
              data={bookmarkData}
              status={bookmarkStatus}
              error={bookmarkError}
              supported={supported}
              onRetry={() => void loadBookmarks(true)}
              onSelect={choose}
            />
          )}
        </div>
      )}
    </>
  )
}
