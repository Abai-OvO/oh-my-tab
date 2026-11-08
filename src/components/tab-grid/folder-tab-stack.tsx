import { useLayoutEffect, useRef, useState } from "react"
import gsap from "gsap"
import { useStackScroll } from "./collection/use-stack-scroll"
import DraggableFolderTab from "./draggable-folder-tab"
import FolderTabRow from "./folder-tab-row"
import { packFolderRows, tabRowUnits } from "./tab-size"
import type { FolderItem, TabEntry } from "@/lib/grid/types"
import { useHomeSettingsStore } from "@/stores/home-settings-store"
import { useTranslation } from "react-i18next"
import { TEXTURE_STEP } from "@/components/effects/texture-grid"

const ROW_GAP = 8
const MIN_ROW_GAP = 4
const COMPACT_ROW_HEIGHT = 46
const PREVIEW_ROW_HEIGHT = 55

function snapRowHeight(height: number, method: "nearest" | "down") {
  const cells =
    method === "nearest"
      ? Math.round((height - 1) / TEXTURE_STEP)
      : Math.floor((height - 1) / TEXTURE_STEP)
  return Math.max(10, cells * TEXTURE_STEP + 1)
}

function fixedRowLayout(availableHeight: number, visibleRows: number) {
  const idealHeight =
    (availableHeight - (visibleRows - 1) * ROW_GAP) / visibleRows
  const maximumHeight =
    (availableHeight - (visibleRows - 1) * MIN_ROW_GAP) / visibleRows
  let height = Math.min(
    PREVIEW_ROW_HEIGHT,
    snapRowHeight(idealHeight, "nearest")
  )
  if (height > maximumHeight) height = snapRowHeight(maximumHeight, "down")
  const gap = Math.min(
    ROW_GAP,
    Math.max(0, (availableHeight - visibleRows * height) / (visibleRows - 1))
  )
  const inset = Math.max(
    0,
    (availableHeight - visibleRows * height - (visibleRows - 1) * gap) / 2
  )
  return { height, gap, inset }
}

export default function FolderTabStack({
  folder,
  className = "",
  topBleed = 0,
  surface = "preview",
  draggable = true,
  tabs,
}: {
  folder: FolderItem
  className?: string
  topBleed?: number
  surface?: "preview" | "dialog"
  draggable?: boolean
  tabs?: TabEntry[]
}) {
  const backgroundType = useHomeSettingsStore((state) => state.backgroundType)
  const appearance = useHomeSettingsStore((state) => state.tabAppearance)
  const { t } = useTranslation()
  const glass = backgroundType !== "solid"
  const visibleTabs = tabs ?? folder.tabs
  const tabIds = visibleTabs.map((tab) => tab.id).join("\u0000")
  const tabIndexes = new Map(visibleTabs.map((tab, index) => [tab.id, index]))
  const wide =
    surface === "preview" &&
    (folder.size === "wide" || folder.size === "wide-tall")
  const [innerColumns, setInnerColumns] = useState(1)
  const [rowHeight, setRowHeight] = useState(44)
  const [stackGap, setStackGap] = useState(8)
  const [stackInset, setStackInset] = useState(0)
  const rowStep = rowHeight + stackGap
  const viewportRef = useRef<HTMLDivElement>(null)
  const previousTabs = useRef<Map<string, { x: number; y: number }>>(new Map())
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const list = viewport?.querySelector<HTMLElement>("[data-folder-list]")
    if (!viewport || !list) return
    const base = list.getBoundingClientRect()
    const nodes = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-tab-id]")
    )
    const next = new Map(
      nodes.map((node) => {
        const rect = node.getBoundingClientRect()
        return [
          node.dataset.tabId ?? "",
          { x: rect.left - base.left, y: rect.top - base.top },
        ] as const
      })
    )
    const previous = previousTabs.current
    previousTabs.current = next
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    nodes.forEach((node) => {
      const before = previous.get(node.dataset.tabId ?? "")
      const after = next.get(node.dataset.tabId ?? "")
      if (!before || !after) return
      const dx = before.x - after.x
      const dy = before.y - after.y
      if (!dx && !dy) return
      gsap.fromTo(
        node,
        { x: dx, y: dy },
        { x: 0, y: 0, duration: 0.22, ease: "power2.out", overwrite: true }
      )
    })
  }, [tabIds])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const update = () => {
      setInnerColumns(wide && viewport.clientWidth >= 400 ? 2 : 1)
      const availableHeight = viewport.clientHeight - topBleed
      if (surface !== "preview") {
        setRowHeight(COMPACT_ROW_HEIGHT)
        setStackGap(ROW_GAP)
        setStackInset(0)
      } else if (folder.size === "small") {
        const height = snapRowHeight(
          Math.min(availableHeight, COMPACT_ROW_HEIGHT),
          "down"
        )
        setRowHeight(height)
        setStackGap(ROW_GAP)
        setStackInset(Math.max(0, (availableHeight - height) / 2))
      } else {
        const visibleRows =
          folder.size === "tall" || folder.size === "wide-tall" ? 9 : 4
        const { height, gap, inset } = fixedRowLayout(
          availableHeight,
          visibleRows
        )
        setRowHeight(height)
        setStackGap(gap)
        setStackInset(inset)
      }
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [folder.size, surface, topBleed, wide, visibleTabs.length])

  useStackScroll(viewportRef, {
    revision: visibleTabs,
    singleRow: surface === "preview" && folder.size === "small",
    topBleed,
    rowStep,
    rowHeight,
    // Rows are already packed into visual lines by packFolderRows.
    innerColumns: 1,
  })

  const lineUnits = innerColumns * 4
  const lines = packFolderRows(visibleTabs, lineUnits)

  return (
    <div
      ref={viewportRef}
      data-folder-surface={draggable ? surface : undefined}
      data-folder-id={draggable ? folder.id : undefined}
      data-folder-columns={draggable ? innerColumns : undefined}
      data-folder-row-height={draggable ? rowHeight : undefined}
      role="region"
      aria-label={t("grid.folder.tabsInside", { name: folder.name })}
      tabIndex={0}
      style={{ marginTop: -topBleed, paddingTop: topBleed }}
      className={`relative min-h-0 [scrollbar-width:none] overflow-x-hidden overflow-y-auto overscroll-contain outline-none [overflow-anchor:none] focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-scrollbar]:hidden ${className}`}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        const amount =
          event.key === "ArrowDown"
            ? rowStep
            : event.key === "ArrowUp"
              ? -rowStep
              : 0
        if (!amount && event.key !== "Home" && event.key !== "End") return
        event.preventDefault()
        event.stopPropagation()
        const viewport = event.currentTarget
        const visibleHeight = viewport.clientHeight - topBleed
        const visibleLines = Math.max(
          1,
          Math.floor((visibleHeight - rowHeight) / rowStep + 1e-6) + 1
        )
        const maxScroll = Math.max(0, (lines.length - visibleLines) * rowStep)
        if (maxScroll <= 0) return
        const top =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? maxScroll
              : viewport.scrollTop + amount
        viewport.scrollTo({
          top,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        })
      }}
    >
      <div
        role="list"
        data-folder-list
        className="relative grid"
        style={{
          marginTop: stackInset,
          paddingBottom: "var(--stack-bottom, 0px)",
        }}
      >
        {lines.map((line, lineIndex) => (
          <div
            key={line.map((tab) => tab.id).join("\u0000")}
            data-stack-row
            role="presentation"
            className="relative grid"
            style={{
              gridTemplateColumns: `repeat(${lineUnits}, minmax(0, 1fr))`,
              columnGap: ROW_GAP,
              height: rowHeight,
              marginBottom: lineIndex < lines.length - 1 ? stackGap : 0,
            }}
          >
            {line.map((tab) => {
              const gap = tab.id === "__folder-gap__"
              const index = tabIndexes.get(tab.id) ?? 0
              return (
                <div
                  key={tab.id}
                  data-tab-id={tab.id}
                  role="listitem"
                  className={`relative min-w-0 after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-[inherit] after:opacity-[var(--stack-shade,0)] ${
                    tab.id === "__folder-gap__" ||
                    appearance.backgroundMode !== "default"
                      ? ""
                      : glass
                        ? "after:bg-card/55"
                        : "after:bg-card"
                  }`}
                  style={{
                    borderRadius: appearance.radius,
                    gridColumn: `span ${tabRowUnits(tab.size)}`,
                  }}
                >
                  {gap ? null : draggable ? (
                    <DraggableFolderTab
                      tab={tab}
                      color={folder.color}
                      folderId={folder.id}
                      index={index}
                      rowPitch={rowStep}
                      animated={!!folder.dynamicEffect}
                      surface={surface}
                    />
                  ) : (
                    <FolderTabRow
                      tab={tab}
                      color={folder.color}
                      folderId={folder.id}
                      index={index}
                      rowPitch={rowStep}
                      animated={!!folder.dynamicEffect}
                      preview={!draggable}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
