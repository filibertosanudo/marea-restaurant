import { test, expect } from "@playwright/test";

/**
 * The one round trip a guest who never creates an account still needs:
 * book a table from the public landing page, get a confirmation code back,
 * then use that code (and nothing else) to look the reservation up and
 * cancel it — exercising createReservationAction, the public /r/[code]
 * page, and cancelReservationByCodeAction against the real deployed app.
 */

/** Tomorrow or later, skipping Monday (the seeded business's one closed day) — computed in UTC, same convention lib/reservations/actions.integration.test.ts's own tomorrowDateString() uses. */
function nextOpenDateString(): string {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  while (d.getUTCDay() === 1) d.setUTCDate(d.getUTCDate() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

test("guest books, then looks up and cancels a reservation by confirmation code", async ({ page }) => {
  await page.goto("/");

  await page.locator("#r-name").fill("Playwright Guest");
  await page.locator("#r-email").fill("playwright-guest@example.com");
  await page.locator("#r-date").fill(nextOpenDateString());

  // Custom listbox (components/marea-landing/Dropdown.tsx), not a native
  // <select> — open it, then pick the first real slot (index 0 is always
  // the "— Choose a time —" placeholder option).
  await page.locator("#r-time").click();
  await page.locator('[role="listbox"] [role="option"]').nth(1).click();

  await page.getByRole("button", { name: "Reserve a table", exact: true }).click();

  const codeLocator = page.locator(".ml-confirmation-code");
  await expect(codeLocator).toBeVisible();
  const confirmationCode = (await codeLocator.textContent())?.trim();
  expect(confirmationCode).toBeTruthy();

  await page.goto(`/r/${confirmationCode}`);
  await expect(page.getByText("Playwright Guest")).toBeVisible();

  await page.getByRole("button", { name: "Cancel reservation" }).click();
  await page.getByRole("button", { name: "Yes, cancel it" }).click();

  await expect(page.getByText("Your reservation has been cancelled.")).toBeVisible();
});
