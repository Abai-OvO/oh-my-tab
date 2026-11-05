import { expect, test } from "@playwright/test"

test("weather settings default to the free source with search or coordinates", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "omt.onboarding",
      JSON.stringify({ state: { seen: true }, version: 0 })
    )
    localStorage.setItem(
      "omt.tab-grid",
      JSON.stringify({
        state: {
          items: [
            {
              id: "weather-config",
              kind: "weather",
              name: "天气",
              color: "#5ba9d1",
              size: "medium",
              provider: "open-meteo",
              locationName: "上海",
              latitude: null,
              longitude: null,
              unit: "celsius",
            },
          ],
          layouts: {},
        },
        version: 0,
      })
    )
  })
  await page.goto("/")

  const tile = page.locator('[data-grid-item-id="weather-config"]')
  await tile.getByRole("button", { name: /选一个关心的地方/ }).click()

  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  const groups = dialog.locator('[data-slot="toggle-group"]')
  await expect(groups).toHaveCount(2)
  const source = groups.nth(0)
  const location = groups.nth(1)

  await expect(
    source.getByRole("button", { name: "免费", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await expect(
    source.getByRole("button", { name: "和风天气", exact: true })
  ).toHaveAttribute("aria-pressed", "false")
  await expect(dialog.getByLabel("和风天气 API Host")).toHaveCount(0)

  await expect(
    location.getByRole("button", { name: "搜索地点", exact: true })
  ).toHaveAttribute("aria-pressed", "true")
  await location.getByRole("button", { name: "经纬度", exact: true }).click()
  await expect(dialog.getByLabel("纬度")).toBeVisible()
  await expect(dialog.getByLabel("经度")).toBeVisible()

  await source.getByRole("button", { name: "和风天气", exact: true }).click()
  await expect(dialog.getByLabel("和风天气 API Host")).toBeVisible()
  await expect(dialog.getByLabel("和风天气 API Key")).toBeVisible()

  await source.getByRole("button", { name: "免费", exact: true }).click()
  await expect(dialog.getByLabel("和风天气 API Host")).toHaveCount(0)
  await location.getByRole("button", { name: "搜索地点", exact: true }).click()
  await expect(dialog.getByLabel("纬度")).toHaveCount(0)
})
