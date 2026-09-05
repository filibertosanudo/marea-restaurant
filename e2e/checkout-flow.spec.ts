import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";

/** See e2e/scripts/get-first-table.ts for why this shells out instead of importing Prisma directly. */
function getFirstTable(): { id: string; code: string; qrToken: string } {
  const output = execFileSync("npx", ["tsx", "e2e/scripts/get-first-table.ts"], {
    encoding: "utf8",
    shell: true,
  });
  return JSON.parse(output);
}

/**
 * A guest scanning the QR code at their table through to a placed order —
 * the one flow that only exists once a table's qrToken resolves through
 * /t/[qrToken] into a live cart, since /menu on its own is the separate
 * takeaway entry point. Ends at the order-confirmation redirect
 * (createOrderAction's own /o/[publicToken]), not a completed Stripe
 * payment — payment method selection happens on that later page and isn't
 * part of "checkout" here.
 */
test("guest scans a table's QR, adds a dish, and checks out", async ({ page }) => {
  const table = getFirstTable();

  await page.goto(`/t/${table.qrToken}`);
  await expect(page.getByText(`Table ${table.code}`)).toBeVisible();

  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await page.getByRole("button", { name: /^Add — /, exact: false }).click();

  await page.getByRole("button", { name: /View cart/ }).click();
  await page.getByRole("link", { name: "Continue" }).click();

  await expect(page).toHaveURL(/\/menu\/checkout$/);
  await page.locator("#guestName").fill("Playwright Guest");
  await page.locator("#guestPhone").fill("5551234567");
  await page.getByRole("button", { name: "Confirm order" }).click();

  await expect(page).toHaveURL(/\/o\/[^/]+$/);
});
