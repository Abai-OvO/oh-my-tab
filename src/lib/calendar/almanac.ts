import { getDayOfYear, getWeek } from "date-fns"

/**
 * Almanac data is split out of the React tree so the month grid and the
 * selected-day panel share one computation, and so the third-party calendar
 * engine stays behind a lazy import.
 */

export type AlmanacHoliday = {
  name: string
  /** True for a 调休 workday (班), false for a statutory rest day (休). */
  work: boolean
}

export type AlmanacLabelKind = "term" | "festival" | "lunar"

export type AlmanacDay = {
  year: number
  month: number
  day: number
  /** Sunday = 0, matching the Sunday-first detail calendar. */
  weekdayIndex: number
  lunarYear: string
  lunarDate: string
  ganZhiYear: string
  zodiac: string
  constellation: string
  weekOfYear: number
  dayOfYear: number
  solarTerm: string
  festivals: string[]
  holiday: AlmanacHoliday | null
  label: string
  labelKind: AlmanacLabelKind
  yi: string[]
  ji: string[]
  jiShen: string[]
  xiongSha: string[]
  yueXiang: string
  wuHou: string
  positions: {
    xi: string
    yangGui: string
    yinGui: string
    fu: string
    cai: string
  }
  pengZu: string
  chong: string
  sha: string
  xiu: string
  zhiXing: string
  tianShen: string
  naYin: string
}

export type AlmanacMonth = {
  year: number
  /** 1-based month. */
  month: number
  /** 0 = Sunday-first, 1 = Monday-first. */
  weekStartsOn: 0 | 1
  /** Always 42 cells for the requested week start, including adjacent-month days. */
  cells: AlmanacDay[]
}

type LunarModule = typeof import("lunar-typescript")

let lunarModule: Promise<LunarModule> | null = null

function loadLunar() {
  lunarModule ??= import("lunar-typescript").catch((error: unknown) => {
    // Let a failed chunk load be retried instead of caching the rejection.
    lunarModule = null
    throw error
  })
  return lunarModule
}

function buildDay(
  module: LunarModule,
  year: number,
  month: number,
  day: number
): AlmanacDay {
  const solar = module.Solar.fromYmd(year, month, day)
  const lunar = solar.getLunar()
  const holiday = module.HolidayUtil.getHoliday(year, month, day)
  const solarTerm = lunar.getJieQi()
  // Major festivals only: the library's "other festivals" include general
  // observances that would compete with the lunar day in a month cell.
  const festivals = Array.from(
    new Set([...solar.getFestivals(), ...lunar.getFestivals()])
  )
  const lunarDay = lunar.getDayInChinese()
  // The first day of a lunar month is more informative than repeating "初一".
  const lunarLabel =
    lunarDay === "初一" ? `${lunar.getMonthInChinese()}月` : lunarDay
  const label = solarTerm || festivals[0] || lunarLabel
  const date = new Date(year, month - 1, day)

  return {
    year,
    month,
    day,
    weekdayIndex: date.getDay(),
    lunarYear: lunar.getYearInChinese(),
    lunarDate: `${lunar.getMonthInChinese()}月${lunarDay}`,
    ganZhiYear: lunar.getYearInGanZhi(),
    zodiac: lunar.getYearShengXiao(),
    constellation: solar.getXingZuo(),
    weekOfYear: getWeek(date, { weekStartsOn: 0 }),
    dayOfYear: getDayOfYear(date),
    solarTerm,
    festivals,
    holiday: holiday
      ? { name: holiday.getName(), work: holiday.isWork() }
      : null,
    label,
    labelKind: solarTerm ? "term" : festivals.length ? "festival" : "lunar",
    yi: lunar.getDayYi(),
    ji: lunar.getDayJi(),
    jiShen: lunar.getDayJiShen(),
    xiongSha: lunar.getDayXiongSha(),
    yueXiang: lunar.getYueXiang(),
    wuHou: lunar.getWuHou(),
    positions: {
      xi: lunar.getPositionXiDesc(),
      yangGui: lunar.getPositionYangGuiDesc(),
      yinGui: lunar.getPositionYinGuiDesc(),
      fu: lunar.getPositionFuDesc(),
      cai: lunar.getPositionCaiDesc(),
    },
    pengZu: `${lunar.getPengZuGan()} ${lunar.getPengZuZhi()}`,
    chong: lunar.getDayChongDesc(),
    sha: lunar.getDaySha(),
    xiu: lunar.getXiu(),
    zhiXing: lunar.getZhiXing(),
    tianShen: `${lunar.getDayTianShen()} ${lunar.getDayTianShenLuck()}`,
    naYin: lunar.getDayNaYin(),
  }
}

/**
 * Returns a 6×7 grid for the requested week start so the detail calendar
 * includes adjacent-month days, while the compact widget keeps its own
 * Monday-first layout.
 */
export async function loadAlmanacMonth(
  year: number,
  month: number,
  weekStartsOn: 0 | 1 = 0
): Promise<AlmanacMonth> {
  const module = await loadLunar()
  const first = new Date(year, month - 1, 1)
  const start = (first.getDay() - weekStartsOn + 7) % 7
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month - 1, 1 - start + index)
    return buildDay(
      module,
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate()
    )
  })
  return { year, month, weekStartsOn, cells }
}
