import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { MagnifyingGlass, Plus } from "@phosphor-icons/react"
import { Input } from "@/components/ui/input"
import {
  commonSiteCategories,
  commonSites,
  type CommonSiteFilter,
} from "@/lib/common-sites"
import { cn } from "@/lib/utils"
import { sourceHost } from "@/lib/widgets/presentation"
import TabIcon from "./tab-icon"

export default function CommonSitePicker({
  onSelect,
}: {
  onSelect: (entry: { name: string; url: string }) => void
}) {
  const { t } = useTranslation()
  const [category, setCategory] = useState<CommonSiteFilter>("all")
  const [query, setQuery] = useState("")
  const results = useMemo(() => {
    const term = query.trim().toLowerCase()
    return commonSites.filter((site) => {
      const inCategory =
        category === "all" ||
        (category === "hot" ? site.hot : site.category === category)
      if (!inCategory) return false
      if (!term) return true
      const label = t(site.labelKey)
      const categoryLabel = t(`grid.quickAdd.categories.${site.category}`)
      return [
        label,
        site.url,
        sourceHost(site.url),
        categoryLabel,
        site.hot ? t("grid.quickAdd.categories.hot") : "",
      ]
        .join("\n")
        .toLowerCase()
        .includes(term)
    })
  }, [category, query, t])
  const countLabel = query.trim()
    ? t("grid.quickAdd.siteResults", { count: results.length })
    : category === "all"
      ? t("grid.quickAdd.siteCountAll", { count: commonSites.length })
      : t("grid.quickAdd.siteCount", { count: results.length })
  const hint =
    results.length === 0
      ? t("grid.quickAdd.tryOther")
      : results.length > 12
        ? t("grid.quickAdd.scrollHint")
        : t("grid.quickAdd.siteHint")

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative flex-none">
        <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          aria-label={t("grid.quickAdd.searchSites")}
          placeholder={t("grid.quickAdd.searchSites")}
          className="h-9 pl-9"
          onChange={(event) => {
            const value = event.target.value
            setQuery(value)
            if (value.trim()) setCategory("all")
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return
            event.preventDefault()
            const first = results[0]
            if (first) onSelect({ name: t(first.labelKey), url: first.url })
          }}
        />
      </div>
      <div
        role="group"
        aria-label={t("grid.quickAdd.sitesTab")}
        className="flex flex-none [scrollbar-width:none] gap-1.5 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden"
      >
        {commonSiteCategories.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={category === value}
            className={cn(
              "h-7 shrink-0 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              category === value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
            onClick={() => {
              setCategory(value)
              setQuery("")
            }}
          >
            {t(`grid.quickAdd.categories.${value}`)}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {results.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:grid-cols-3">
            {results.map((site) => {
              const label = t(site.labelKey)
              return (
                <button
                  key={site.id}
                  type="button"
                  aria-label={t("grid.quickAdd.addSite", { name: label })}
                  className="relative flex min-h-[62px] min-w-0 items-center gap-2 rounded-xl border border-transparent bg-muted/50 p-2.5 text-left transition-colors outline-none hover:border-ring/30 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSelect({ name: label, url: site.url })}
                >
                  <TabIcon
                    url={site.url}
                    className="size-8 rounded-lg"
                    fallback={
                      <span
                        aria-hidden="true"
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
                        style={{ backgroundColor: site.color }}
                      >
                        {site.initial}
                      </span>
                    }
                  />
                  <span className="min-w-0 pr-4">
                    <span className="block truncate text-sm font-medium">
                      {label}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {sourceHost(site.url)}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="absolute top-2 right-2 grid size-4 place-items-center rounded-full border border-border bg-background text-muted-foreground"
                  >
                    <Plus className="size-2.5" />
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {t("grid.quickAdd.siteNoMatch")}
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
    </div>
  )
}
