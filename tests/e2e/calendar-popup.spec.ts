import { expect, test } from "@playwright/test"

test("calendar opens the almanac popup and navigates dates", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date(2026, 9, 18, 12))
  await page.addInitScript(() =>
    localStorage.setItem(
      "omt.onboarding",
      JSON.stringify({ state: { seen: true }, version: 0 })
    )
  )
  await page.goto("/")
  await page.getByRole("button", { name: "更多操作", exact: true }).click()
  await page.getByRole("button", { name: "添加组件", exact: true }).click()
  await page.getByRole("button", { name: "效率", exact: true }).click()
  await page.getByRole("button", { name: "选择日历", exact: true }).click()
  const creator = page.getByRole("dialog", { name: "日历", exact: true })
  await creator.getByRole("button", { name: "4×4", exact: true }).click()
  await creator.getByRole("button", { name: "添加", exact: true }).click()

  await page.getByRole("button", { name: "打开日历详情", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "日历", exact: true })
  await expect(dialog).toBeVisible()
  await expect(
    dialog.getByRole("button", { name: "2026", exact: true })
  ).toBeVisible()
  await expect(
    dialog.getByRole("button", { name: "10月", exact: true })
  ).toBeVisible()
  await expect(dialog.getByText(/九月初九/)).toBeVisible()
  await expect(
    dialog.getByText("重阳节", { exact: true }).first()
  ).toBeVisible()
  await expect(dialog.getByText("宜", { exact: true })).toBeVisible()
  await expect(dialog.getByText("忌", { exact: true })).toBeVisible()
  await expect(dialog.getByText("西北", { exact: true })).toBeVisible()

  await dialog.getByRole("button", { name: "下个月", exact: true }).click()
  await expect(
    dialog.getByRole("button", { name: "11月", exact: true })
  ).toBeVisible()
  await dialog.getByRole("button", { name: "今天", exact: true }).click()
  await expect(
    dialog.getByRole("button", { name: "10月", exact: true })
  ).toBeVisible()

  await dialog
    .getByRole("button", { name: "切换为周一开头", exact: true })
    .click()
  await expect(
    dialog.getByRole("button", { name: "切换为周日开头", exact: true })
  ).toBeVisible()

  await dialog.getByRole("button", { name: /10月1日/ }).click()
  await expect(
    dialog.getByText("国庆节", { exact: true }).first()
  ).toBeVisible()
  await expect(dialog.getByText("休", { exact: true }).first()).toBeVisible()

  await dialog.getByRole("button", { name: "关闭", exact: true }).click()
  await expect(dialog).toHaveCount(0)
})
