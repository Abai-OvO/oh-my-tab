import { lazy, Suspense, useState, type CSSProperties } from "react"
import { Translate } from "@phosphor-icons/react"
import { useTranslation } from "react-i18next"
import type { TranslateWidgetItem } from "@/lib/grid/utility-types"
import type { WidgetProps } from "./utility/surface"
import ComponentBackground from "./shared/component-background"
import "./translate/translate.css"

const TranslatePanel = lazy(() => import("./translate/panel"))

export default function TranslateTile({
  item,
  preview = false,
}: WidgetProps<TranslateWidgetItem>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const style = { "--translate-accent": item.color } as CSSProperties
  const content = (
    <>
      <ComponentBackground
        color={item.color}
        animated={!preview && !!item.dynamicEffect}
      />
      <span className="translate-tile-icon" aria-hidden="true">
        <Translate size={32} weight="regular" />
      </span>
    </>
  )

  // Catalog and editor previews must stay non-interactive; the live tile is a
  // full-tile button that the grid can still drag.
  if (preview)
    return (
      <div
        data-utility-widget="translate"
        data-preview="true"
        aria-hidden="true"
        className="translate-tile"
        style={style}
      >
        {content}
      </div>
    )

  return (
    <>
      <button
        type="button"
        data-utility-widget="translate"
        aria-label={t("grid.translate.open", { name: item.name })}
        title={item.name}
        onClick={() => setOpen(true)}
        className="translate-tile"
        style={style}
      >
        {content}
      </button>
      {open && (
        <Suspense fallback={null}>
          <TranslatePanel item={item} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
