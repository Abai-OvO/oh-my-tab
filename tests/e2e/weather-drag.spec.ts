import { expect, test } from "@playwright/test"

test("weather without a key stays draggable and still opens setup on click", async ({
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
              id: "weather-setup",
              kind: "weather",
              name: "天气",
              color: "#5ba9d1",
              size: "medium",
              provider: "qweather",
              locationName: "上海",
              latitude: 31.2304,
              longitude: 121.4737,
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

  const tile = page.locator('[data-grid-item-id="weather-setup"]')
  const empty = tile.locator("button.utility-empty")
  await expect(empty).toBeVisible()
  await expect(empty).toHaveAttribute("data-drag-through", "true")

  const before = await tile.boundingBox()
  const box = await empty.boundingBox()
  expect(before && box).toBeTruthy()
  if (!before || !box) return

  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + 220, startY + 120, { steps: 10 })
  await page.mouse.up()

  await expect
    .poll(async () => {
      const after = await tile.boundingBox()
      return after
        ? Math.abs(after.x - before.x) + Math.abs(after.y - before.y)
        : 0
    })
    .toBeGreaterThan(20)
  await expect(page.getByRole("dialog")).toHaveCount(0)

  // The full-tile setup action still opens the editor on a plain click.
  await empty.click()
  await expect(page.getByRole("dialog")).toHaveCount(1)
})
