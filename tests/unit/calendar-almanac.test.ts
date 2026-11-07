import { describe, expect, it } from "vitest"
import { loadAlmanacMonth, type AlmanacMonth } from "@/lib/calendar/almanac"

function findDay(month: AlmanacMonth, day: number) {
  const cell = month.cells.find(
    (candidate) =>
      candidate.year === 2026 && candidate.month === 10 && candidate.day === day
  )
  if (!cell) throw new Error(`Missing 2026-10-${day}`)
  return cell
}

describe("calendar almanac", () => {
  it("builds a Sunday-first 6x7 grid with adjacent-month days", async () => {
    const month = await loadAlmanacMonth(2026, 10)
    expect(month.weekStartsOn).toBe(0)
    expect(month.cells).toHaveLength(42)
    expect(month.cells[0]).toMatchObject({
      year: 2026,
      month: 9,
      day: 27,
      weekdayIndex: 0,
    })
    expect(month.cells[41]).toMatchObject({
      year: 2026,
      month: 11,
      day: 7,
    })
  })

  it("builds a Monday-first grid when requested", async () => {
    const month = await loadAlmanacMonth(2026, 10, 1)
    expect(month.weekStartsOn).toBe(1)
    expect(month.cells).toHaveLength(42)
    expect(month.cells[0]).toMatchObject({
      year: 2026,
      month: 9,
      day: 28,
      weekdayIndex: 1,
    })
    expect(month.cells[41]).toMatchObject({
      year: 2026,
      month: 11,
      day: 8,
    })
  })

  it("matches the reference date", async () => {
    const day = findDay(await loadAlmanacMonth(2026, 10), 18)
    expect(day.lunarYear).toBe("二〇二六")
    expect(day.lunarDate).toBe("九月初九")
    expect(day.ganZhiYear).toBe("丙午")
    expect(day.zodiac).toBe("马")
    expect(day.constellation).toBe("天秤")
    expect(day.solarTerm).toBe("")
    expect(day.festivals).toContain("重阳节")
    expect(day.weekOfYear).toBe(43)
    expect(day.dayOfYear).toBe(291)
    expect(day.label).toBe("重阳节")
    expect(day.labelKind).toBe("festival")
    expect(day.yi).toContain("解除")
    expect(day.ji).toContain("嫁娶")
    expect(day.yueXiang).toBeTruthy()
    expect(day.wuHou).toBe("菊有黄花")
    expect(day.positions).toEqual({
      xi: "西北",
      yangGui: "西南",
      yinGui: "正北",
      fu: "西南",
      cai: "东北",
    })
  })

  it("marks statutory rest days and makeup workdays", async () => {
    const month = await loadAlmanacMonth(2026, 10)
    expect(findDay(month, 1).holiday).toEqual({
      name: "国庆节",
      work: false,
    })
    expect(findDay(month, 7).holiday).toEqual({
      name: "国庆节",
      work: false,
    })
    expect(findDay(month, 10).holiday).toEqual({
      name: "国庆节",
      work: true,
    })
    expect(findDay(month, 18).holiday).toBeNull()
  })

  it("prefers a solar term as the compact day label", async () => {
    const day = findDay(await loadAlmanacMonth(2026, 10), 8)
    expect(day.solarTerm).toBe("寒露")
    expect(day.label).toBe("寒露")
    expect(day.labelKind).toBe("term")
  })

  it("shows the lunar month on the first day of a lunar month", async () => {
    const day = findDay(await loadAlmanacMonth(2026, 10), 10)
    expect(day.lunarDate).toBe("九月初一")
    expect(day.label).toBe("九月")
    expect(day.labelKind).toBe("lunar")
  })
})
