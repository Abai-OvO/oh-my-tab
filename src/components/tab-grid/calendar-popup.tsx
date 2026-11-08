import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import {
  CalendarBlank,
  CalendarDots,
  CaretDown,
  CaretLeft,
  CaretRight,
  CircleNotch,
} from "@phosphor-icons/react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  loadAlmanacMonth,
  type AlmanacDay,
  type AlmanacMonth,
} from "@/lib/calendar/almanac"
import type { CalendarItem } from "@/lib/grid/types"
import { weekdayOrder } from "./calendar-utils"
import "./calendar-popup.css"

type WeekStart = 0 | 1
type PickerKind = "year" | "month" | null
type AlmanacView = { year: number; month: number }
type AlmanacSelection = AlmanacView & { day: number }

type CalendarPopupProps = {
  onOpenChange: (open: boolean) => void
  item: CalendarItem
}

const CONSTELLATION_GLYPHS: Record<string, string> = {
  白羊: "♈",
  金牛: "♉",
  双子: "♊",
  巨蟹: "♋",
  狮子: "♌",
  处女: "♍",
  天秤: "♎",
  天蝎: "♏",
  射手: "♐",
  摩羯: "♑",
  水瓶: "♒",
  双鱼: "♓",
}

let preferredWeekStart: WeekStart = 0

const pad = (value: number) => String(value).padStart(2, "0")

function viewOf(date: Date): AlmanacView {
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

function selectionOf(date: Date): AlmanacSelection {
  return { ...viewOf(date), day: date.getDate() }
}

function sameDay(cell: AlmanacDay, selection: AlmanacSelection) {
  return (
    cell.year === selection.year &&
    cell.month === selection.month &&
    cell.day === selection.day
  )
}

function monthName(
  locale: string,
  year: number,
  month: number,
  width: "long" | "short"
) {
  return new Intl.DateTimeFormat(locale, { month: width }).format(
    new Date(year, month - 1, 1)
  )
}

function weekLabel(locale: string, date: Date, width: "long" | "short") {
  return new Intl.DateTimeFormat(locale, { weekday: width }).format(date)
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function Chips({ items }: { items: string[] }) {
  const unique = Array.from(new Set(items))
  if (!unique.length) return null
  return (
    <ul className="calendar-popup-chips">
      {unique.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="calendar-popup-detail-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function DayDetails({
  cell,
  locale,
  today,
}: {
  cell: AlmanacDay
  locale: string
  today: Date
}) {
  const { t } = useTranslation()
  const date = new Date(cell.year, cell.month - 1, cell.day)
  const dateLabel = isoDate(cell.year, cell.month, cell.day)
  const countdownDays = Math.round(
    (Date.UTC(cell.year, cell.month - 1, cell.day) -
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) /
      86400000
  )
  const countdown =
    countdownDays > 0
      ? t("grid.calendar.countdown", {
          date: dateLabel,
          days: countdownDays,
        })
      : null
  const yiText = cell.yi.join(locale.startsWith("zh") ? "，" : ", ")
  const jiText = cell.ji.join(locale.startsWith("zh") ? "，" : ", ")
  const directionKeys = ["xi", "yangGui", "yinGui", "fu", "cai"] as const
  const signGlyph = CONSTELLATION_GLYPHS[cell.constellation] ?? "✦"

  return (
    <>
      <div className="calendar-popup-detail-head">
        <p className="calendar-popup-detail-date">
          {dateLabel} {weekLabel(locale, date, "short")}
        </p>
        <div className="calendar-popup-hero" aria-hidden="true">
          <span className="calendar-popup-hero-rings">
            <span />
            <span />
          </span>
          {cell.day}
        </div>
        <p className="calendar-popup-lunar-date">
          {cell.lunarYear}年{cell.lunarDate}
        </p>
        <p className="calendar-popup-ganzhi">
          {t("grid.calendar.ganZhiYear", {
            ganZhi: cell.ganZhiYear,
            zodiac: cell.zodiac,
          })}
        </p>
        <p className="calendar-popup-week">
          {t("grid.calendar.weekDayOfYear", {
            week: cell.weekOfYear,
            day: cell.dayOfYear,
          })}
        </p>
        {countdown && <p className="calendar-popup-countdown">{countdown}</p>}
      </div>

      <div className="calendar-popup-tags">
        <div className="calendar-popup-tag">
          <span className="calendar-popup-tag-label is-zodiac">
            {t("grid.calendar.zodiac")}
          </span>
          <span className="calendar-popup-tag-value">{cell.zodiac}</span>
        </div>
        <div className="calendar-popup-tag">
          <span className="calendar-popup-tag-label is-sign">
            {t("grid.calendar.constellation")}
          </span>
          <span className="calendar-popup-sign-glyph" aria-hidden="true">
            {signGlyph}
          </span>
          <span className="calendar-popup-tag-value">
            {t("grid.calendar.constellationValue", {
              value: cell.constellation,
            })}
          </span>
        </div>
        {cell.solarTerm && (
          <div className="calendar-popup-tag">
            <span className="calendar-popup-tag-label is-festival">
              {t("grid.calendar.solarTerm")}
            </span>
            <span className="calendar-popup-tag-value">{cell.solarTerm}</span>
          </div>
        )}
        {cell.festivals.length > 0 && (
          <div className="calendar-popup-tag">
            <span className="calendar-popup-tag-label is-festival">
              {t("grid.calendar.festivals")}
            </span>
            <span className="calendar-popup-tag-value">
              {cell.festivals.join("、")}
            </span>
          </div>
        )}
      </div>

      <div className="calendar-popup-yiji">
        <div className="calendar-popup-yiji-row">
          <span className="calendar-popup-mark is-yi">
            {t("grid.calendar.yi")}
          </span>
          <p className="calendar-popup-yiji-text">
            {yiText || t("grid.calendar.noData")}
          </p>
        </div>
        <div className="calendar-popup-yiji-row">
          <span className="calendar-popup-mark is-ji">
            {t("grid.calendar.ji")}
          </span>
          <p className="calendar-popup-yiji-text">
            {jiText || t("grid.calendar.noData")}
          </p>
        </div>
      </div>

      <div className="calendar-popup-meta">
        <span className="calendar-popup-meta-item">
          <span className="calendar-popup-meta-label">
            {t("grid.calendar.yueXiang")}
          </span>
          <span className="calendar-popup-meta-value">
            {cell.yueXiang || t("grid.calendar.noData")}
          </span>
        </span>
        <span className="calendar-popup-meta-item">
          <span className="calendar-popup-meta-label">
            {t("grid.calendar.wuHou")}
          </span>
          <span className="calendar-popup-meta-value">
            {cell.wuHou || t("grid.calendar.noData")}
          </span>
        </span>
      </div>

      <dl className="calendar-popup-directions">
        {directionKeys.map((key) => (
          <div className="calendar-popup-dir" key={key}>
            <dt>
              {t("grid.calendar.directionLabel", {
                name: t(`grid.calendar.${key}`),
              })}
            </dt>
            <dd>{cell.positions[key]}</dd>
          </div>
        ))}
      </dl>

      <details
        className="calendar-popup-more"
        onToggle={(event) => {
          const details = event.currentTarget
          if (!details.open) return
          const scroll = details.closest(".calendar-popup-detail-scroll")
          if (!(scroll instanceof HTMLElement)) return
          scroll.scrollTop +=
            details.getBoundingClientRect().top -
            scroll.getBoundingClientRect().top
        }}
      >
        <summary>
          <span className="calendar-popup-chevron" aria-hidden="true">
            ›
          </span>
          {t("grid.calendar.moreAlmanac")}
        </summary>
        {cell.jiShen.length > 0 && (
          <div className="calendar-popup-more-group">
            <h4>{t("grid.calendar.jiShen")}</h4>
            <Chips items={cell.jiShen} />
          </div>
        )}
        {cell.xiongSha.length > 0 && (
          <div className="calendar-popup-more-group">
            <h4>{t("grid.calendar.xiongSha")}</h4>
            <Chips items={cell.xiongSha} />
          </div>
        )}
        <dl className="calendar-popup-details">
          <DetailRow label={t("grid.calendar.pengZu")} value={cell.pengZu} />
          <DetailRow
            label={t("grid.calendar.chong")}
            value={`${cell.chong} · ${t("grid.calendar.sha")} ${cell.sha}`}
          />
          <DetailRow label={t("grid.calendar.xiu")} value={cell.xiu} />
          <DetailRow label={t("grid.calendar.zhiXing")} value={cell.zhiXing} />
          <DetailRow
            label={t("grid.calendar.tianShen")}
            value={cell.tianShen}
          />
          <DetailRow label={t("grid.calendar.naYin")} value={cell.naYin} />
        </dl>
      </details>
    </>
  )
}

export default function CalendarPopup({
  onOpenChange,
  item,
}: CalendarPopupProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || "zh-CN"
  const [today, setToday] = useState(() => new Date())
  const [weekStart, setWeekStart] = useState<WeekStart>(preferredWeekStart)
  const [view, setView] = useState<AlmanacView>(() => viewOf(today))
  const [selection, setSelection] = useState<AlmanacSelection>(() =>
    selectionOf(today)
  )
  const [month, setMonth] = useState<AlmanacMonth | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [picker, setPicker] = useState<PickerKind>(null)
  const [pickerYear, setPickerYear] = useState(() => viewOf(today).year)
  const [decade, setDecade] = useState(
    () => Math.floor(viewOf(today).year / 10) * 10
  )
  const cardRef = useRef<HTMLElement>(null)
  const yearChipRef = useRef<HTMLButtonElement>(null)
  const monthChipRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    loadAlmanacMonth(view.year, view.month, weekStart)
      .then((data) => {
        if (cancelled) return
        setMonth(data)
        setLoading(false)
        setFailed(false)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [view.year, view.month, weekStart, reloadToken])

  const narrowWeekdays = useMemo(() => weekdayOrder(locale, "narrow"), [locale])
  const monthShort = useMemo(
    () => monthName(locale, view.year, view.month, "short"),
    [locale, view.year, view.month]
  )
  const groupLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
      }).format(new Date(view.year, view.month - 1, 1)),
    [locale, view.year, view.month]
  )
  const gridWeekStart = month?.weekStartsOn ?? weekStart
  const orderedWeekdays = useMemo(
    () =>
      gridWeekStart === 0
        ? [narrowWeekdays[6], ...narrowWeekdays.slice(0, 6)]
        : narrowWeekdays,
    [gridWeekStart, narrowWeekdays]
  )
  const mondayShort = narrowWeekdays[0]
  const sundayShort = narrowWeekdays[6]
  const todaySelection = selectionOf(today)
  const selectedCell = month?.cells.find((cell) => sameDay(cell, selection))

  useLayoutEffect(() => {
    if (!picker) return
    const place = () => {
      const card = cardRef.current
      const pickerElement = pickerRef.current
      const chip =
        picker === "year" ? yearChipRef.current : monthChipRef.current
      if (!card || !pickerElement || !chip) return
      const cardRect = card.getBoundingClientRect()
      const chipRect = chip.getBoundingClientRect()
      const width = pickerElement.offsetWidth
      const maxLeft = Math.max(8, cardRect.width - width - 8)
      const left = Math.min(Math.max(8, chipRect.left - cardRect.left), maxLeft)
      pickerElement.style.left = `${left}px`
      pickerElement.style.top = `${chipRect.bottom - cardRect.top + 6}px`
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [picker, pickerYear, decade, view.year, view.month])

  useEffect(() => {
    if (!picker) return
    const selected =
      pickerRef.current?.querySelector<HTMLButtonElement>(".is-selected")
    selected?.focus()
  }, [picker])

  useEffect(() => {
    if (!picker) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      const target = event.target
      if (
        pickerRef.current?.contains(target) ||
        yearChipRef.current?.contains(target) ||
        monthChipRef.current?.contains(target)
      ) {
        return
      }
      setPicker(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      // Escape closes the popover, not the whole calendar dialog.
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      setPicker(null)
    }
    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown, true)
    }
  }, [picker])

  function openPicker(kind: Exclude<PickerKind, null>) {
    if (picker === kind) {
      setPicker(null)
      return
    }
    setPickerYear(view.year)
    setDecade(Math.floor(view.year / 10) * 10)
    setPicker(kind)
  }

  function changeView(year: number, month: number) {
    setPicker(null)
    if (year === view.year && month === view.month) return
    setLoading(true)
    setFailed(false)
    setView({ year, month })
    setSelection((current) => {
      const lastDay = new Date(year, month, 0).getDate()
      return { year, month, day: Math.min(current.day, lastDay) }
    })
  }

  function shiftMonth(delta: number) {
    const next = new Date(view.year, view.month - 1 + delta, 1)
    changeView(next.getFullYear(), next.getMonth() + 1)
  }

  function goToday() {
    const now = new Date()
    const nextView = viewOf(now)
    setToday(now)
    setPicker(null)
    setSelection(selectionOf(now))
    if (nextView.year !== view.year || nextView.month !== view.month) {
      setLoading(true)
      setFailed(false)
      setView(nextView)
    }
  }

  function selectDay(cell: AlmanacDay) {
    setPicker(null)
    setSelection({
      year: cell.year,
      month: cell.month,
      day: cell.day,
    })
    if (cell.year !== view.year || cell.month !== view.month) {
      setLoading(true)
      setFailed(false)
      setView({ year: cell.year, month: cell.month })
    }
  }

  function toggleWeekStart() {
    const next: WeekStart = weekStart === 0 ? 1 : 0
    preferredWeekStart = next
    setPicker(null)
    setWeekStart(next)
  }

  function dayAriaLabel(cell: AlmanacDay) {
    const solar = new Intl.DateTimeFormat(locale, {
      dateStyle: "full",
    }).format(new Date(cell.year, cell.month - 1, cell.day))
    const festival = cell.solarTerm || cell.festivals[0]
    const holiday = cell.holiday
      ? ` · ${cell.holiday.name} ${
          cell.holiday.work
            ? t("grid.calendar.workday")
            : t("grid.calendar.restDay")
        }`
      : ""
    return `${solar} · ${t("grid.calendar.lunar")} ${cell.lunarDate}${
      festival ? ` · ${festival}` : ""
    }${holiday}`
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        className="calendar-popup-dialog"
        onPointerDown={(event) => {
          // Same as the translate panel: synthetic pointer and mouse events
          // from this portal bubble through the React tree and would arm the
          // drag charge of the calendar tile underneath. Swallow both.
          event.stopPropagation()
        }}
        onMouseDown={(event) => {
          event.stopPropagation()
        }}
      >
        <div
          className="calendar-popup"
          style={{ "--calendar-accent": item.color } as CSSProperties}
        >
          <DialogTitle className="calendar-popup-title">
            <span className="calendar-popup-title-icon">
              <CalendarDots size={15} aria-hidden="true" />
            </span>
            <span>{item.name}</span>
          </DialogTitle>

          {loading ? (
            <div className="calendar-popup-state" role="status">
              <CircleNotch
                className="calendar-popup-spin"
                size={20}
                aria-hidden="true"
              />
              {t("grid.calendar.loading")}
            </div>
          ) : failed ? (
            <div className="calendar-popup-state" role="alert">
              <span>{t("grid.calendar.loadFailed")}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setLoading(true)
                  setFailed(false)
                  setReloadToken((value) => value + 1)
                }}
              >
                {t("grid.calendar.retry")}
              </Button>
            </div>
          ) : month ? (
            <div className="calendar-popup-body">
              <section
                ref={cardRef}
                className="calendar-popup-calendar-card"
                aria-label={groupLabel}
              >
                <div className="calendar-popup-toolbar">
                  <div className="calendar-popup-toolbar-group">
                    <button
                      ref={yearChipRef}
                      type="button"
                      className="calendar-popup-chip"
                      aria-haspopup="dialog"
                      aria-expanded={picker === "year"}
                      onClick={() => openPicker("year")}
                    >
                      <CalendarBlank size={13} aria-hidden="true" />
                      <span>{view.year}</span>
                      <CaretDown
                        className="calendar-popup-chip-caret"
                        size={11}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      className="calendar-popup-icon-button"
                      aria-label={t("grid.calendar.previousMonth")}
                      onClick={() => shiftMonth(-1)}
                    >
                      <CaretLeft size={15} aria-hidden="true" />
                    </button>
                    <button
                      ref={monthChipRef}
                      type="button"
                      className="calendar-popup-chip"
                      aria-haspopup="dialog"
                      aria-expanded={picker === "month"}
                      onClick={() => openPicker("month")}
                    >
                      <CalendarBlank size={13} aria-hidden="true" />
                      <span>{monthShort}</span>
                      <CaretDown
                        className="calendar-popup-chip-caret"
                        size={11}
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      className="calendar-popup-icon-button"
                      aria-label={t("grid.calendar.nextMonth")}
                      onClick={() => shiftMonth(1)}
                    >
                      <CaretRight size={15} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="calendar-popup-toolbar-group">
                    <button
                      type="button"
                      className="calendar-popup-today"
                      aria-label={t("grid.calendar.today")}
                      onClick={goToday}
                    >
                      {t("grid.calendar.todayShort")}
                    </button>
                    <button
                      type="button"
                      className="calendar-popup-week-switch"
                      aria-pressed={weekStart === 0}
                      aria-label={
                        weekStart === 0
                          ? t("grid.calendar.switchToMondayStart")
                          : t("grid.calendar.switchToSundayStart")
                      }
                      onClick={toggleWeekStart}
                    >
                      <span className="calendar-popup-week-track">
                        <span
                          className="calendar-popup-week-option is-monday"
                          aria-hidden="true"
                        >
                          {mondayShort}
                        </span>
                        <span
                          className="calendar-popup-week-option is-sunday"
                          aria-hidden="true"
                        >
                          {sundayShort}
                        </span>
                        <span className="calendar-popup-week-knob" />
                      </span>
                    </button>
                  </div>
                </div>

                <div className="calendar-popup-weekdays" aria-hidden="true">
                  {orderedWeekdays.map((label, index) => {
                    const weekdayIndex =
                      gridWeekStart === 0 ? index : (index + 1) % 7
                    const weekend = weekdayIndex === 0 || weekdayIndex === 6
                    return (
                      <span
                        key={`${label}-${index}`}
                        className={weekend ? "is-weekend" : ""}
                      >
                        {label}
                      </span>
                    )
                  })}
                </div>

                <div
                  className="calendar-popup-grid"
                  role="group"
                  aria-label={groupLabel}
                >
                  {month.cells.map((cell) => {
                    const selected = sameDay(cell, selection)
                    const todayCell = sameDay(cell, todaySelection)
                    const outside = cell.month !== view.month
                    const rest = Boolean(cell.holiday && !cell.holiday.work)
                    const work = Boolean(cell.holiday && cell.holiday.work)
                    const weekend =
                      cell.weekdayIndex === 0 || cell.weekdayIndex === 6
                    const classes = [
                      "calendar-popup-day",
                      outside ? "is-outside" : "",
                      rest ? "is-rest" : "",
                      work ? "is-work" : "",
                      weekend ? "is-weekend" : "",
                      selected ? "is-selected" : "",
                      todayCell ? "is-today" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                    return (
                      <button
                        key={`${cell.year}-${cell.month}-${cell.day}`}
                        type="button"
                        className={classes}
                        aria-pressed={selected}
                        aria-current={todayCell ? "date" : undefined}
                        aria-label={dayAriaLabel(cell)}
                        onClick={() => selectDay(cell)}
                      >
                        <span className="calendar-popup-day-number">
                          {cell.day}
                        </span>
                        <span
                          className={[
                            "calendar-popup-day-label",
                            cell.labelKind !== "lunar" ? "is-accent" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {cell.label}
                        </span>
                        {cell.holiday && (
                          <span
                            className={`calendar-popup-day-badge ${
                              cell.holiday.work ? "is-work" : "is-rest"
                            }`}
                          >
                            {cell.holiday.work
                              ? t("grid.calendar.workday")
                              : t("grid.calendar.restDay")}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>

                {picker && (
                  <div className="calendar-popup-picker-layer">
                    <div
                      ref={pickerRef}
                      className="calendar-popup-picker"
                      role="dialog"
                      aria-label={
                        picker === "year"
                          ? t("grid.calendar.selectYear")
                          : t("grid.calendar.selectMonth")
                      }
                    >
                      {picker === "year" ? (
                        <>
                          <div className="calendar-popup-picker-head">
                            <button
                              type="button"
                              className="calendar-popup-picker-arrow"
                              aria-label={t("grid.calendar.previousDecade")}
                              onClick={() => setDecade((value) => value - 10)}
                            >
                              <CaretLeft size={13} aria-hidden="true" />
                            </button>
                            <span>
                              {t("grid.calendar.yearRange", {
                                start: decade,
                                end: decade + 9,
                              })}
                            </span>
                            <button
                              type="button"
                              className="calendar-popup-picker-arrow"
                              aria-label={t("grid.calendar.nextDecade")}
                              onClick={() => setDecade((value) => value + 10)}
                            >
                              <CaretRight size={13} aria-hidden="true" />
                            </button>
                          </div>
                          <div className="calendar-popup-picker-grid is-years">
                            {Array.from({ length: 10 }, (_, index) => {
                              const year = decade + index
                              const selected = year === view.year
                              return (
                                <button
                                  key={year}
                                  type="button"
                                  className={[
                                    "calendar-popup-picker-option",
                                    selected ? "is-selected" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  aria-pressed={selected}
                                  onClick={() => changeView(year, view.month)}
                                >
                                  {year}
                                </button>
                              )
                            })}
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="calendar-popup-picker-head">
                            <button
                              type="button"
                              className="calendar-popup-picker-arrow"
                              aria-label={t("grid.calendar.previousYear")}
                              onClick={() =>
                                setPickerYear((value) => value - 1)
                              }
                            >
                              <CaretLeft size={13} aria-hidden="true" />
                            </button>
                            <span>
                              {t("grid.calendar.yearLabel", {
                                year: pickerYear,
                              })}
                            </span>
                            <button
                              type="button"
                              className="calendar-popup-picker-arrow"
                              aria-label={t("grid.calendar.nextYear")}
                              onClick={() =>
                                setPickerYear((value) => value + 1)
                              }
                            >
                              <CaretRight size={13} aria-hidden="true" />
                            </button>
                          </div>
                          <div className="calendar-popup-picker-grid is-months">
                            {Array.from({ length: 12 }, (_, index) => {
                              const month = index + 1
                              const selected =
                                view.year === pickerYear && view.month === month
                              return (
                                <button
                                  key={month}
                                  type="button"
                                  className={[
                                    "calendar-popup-picker-option",
                                    selected ? "is-selected" : "",
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                  aria-pressed={selected}
                                  onClick={() => changeView(pickerYear, month)}
                                >
                                  {monthName(locale, pickerYear, month, "long")}
                                </button>
                              )
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </section>

              <aside
                className="calendar-popup-detail-card"
                aria-label={t("grid.calendar.detailLabel")}
              >
                <div
                  className="calendar-popup-detail-scroll"
                  key={`${selection.year}-${selection.month}-${selection.day}`}
                  aria-live="polite"
                >
                  {selectedCell ? (
                    <DayDetails
                      cell={selectedCell}
                      locale={locale}
                      today={today}
                    />
                  ) : (
                    <div className="calendar-popup-state">
                      {t("grid.calendar.loading")}
                    </div>
                  )}
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
