import { test, expect } from "@playwright/test";

/**
 * Staff logging in and working the kitchen board — the seeded A-0001 order
 * (PENDING, dine-in) advanced through PREPARING to READY, one tap per
 * legal step, exactly as advanceOrderStatusAction's own state machine
 * allows. Never skips a step: the board only ever offers the single next
 * status, never a jump to READY directly.
 */
test("staff logs in and advances an order from pending to ready", async ({ page, baseURL }) => {
  // The admin surface's own default (lib/i18n/cookie.ts's getAdminLang) is
  // Spanish absent this cookie — pinned to English so this test asserts
  // against one fixed set of strings rather than whatever the default
  // happens to be.
  await page.context().addCookies([{ name: "marea-lang", value: "en", url: baseURL }]);

  await page.goto("/admin/login");
  await page.locator("#email").fill("admin@marea.test");
  await page.locator("#password").fill("MareaAdmin123!");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/pedidos");
  const card = page.locator("div.rounded-md", { hasText: "A-0001" });

  await card.getByRole("button", { name: "Start preparing" }).click();
  await expect(card.getByRole("button", { name: "Mark ready" })).toBeVisible();

  await card.getByRole("button", { name: "Mark ready" }).click();
  await expect(card.getByRole("button", { name: "Deliver" })).toBeVisible();
});
