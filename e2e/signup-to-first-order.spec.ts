import { execFileSync } from "node:child_process";
import { test, expect } from "@playwright/test";

/**
 * Module 19's promise, end to end: a restaurant nobody set up signs up,
 * confirms its email, goes through the wizard, imports its menu from a CSV,
 * and takes its first order, with nobody from the platform touching anything.
 *
 * Stripe is left out on purpose: the e2e stack runs with no Stripe key, so
 * the trial does not start and card payments stay off, and the order is paid
 * at the counter like a cash-only restaurant's would be. Connecting Stripe is
 * covered by lib/payments/connect-actions tests and the sandbox smoke tests;
 * the subscription by lib/billing and lib/stripe/billing.smoke.
 */

function verifyUrlFor(email: string): string {
  const output = execFileSync("npx", ["tsx", "e2e/scripts/get-verify-url.ts", email], {
    env: process.env,
    encoding: "utf8",
    shell: true,
  });
  return JSON.parse(output.slice(output.indexOf("{"))).verifyUrl;
}

function hostFor(baseURL: string | undefined, slug: string): string {
  const url = new URL(baseURL ?? "http://marea.localhost:3000");
  url.hostname = `${slug}.localhost`;
  return url.origin;
}

const MENU_CSV = ["category,name,price,description", "Entradas,Ceviche de prueba,120.00,", "Entradas,Tostada de prueba,95.50,"].join("\n");

test("a new restaurant signs up, sets itself up and takes its first order", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const run = Date.now().toString(36);
  const slug = `e2e-${run}`;
  const email = `owner-${run}@example.test`;
  const password = "greenTurtleUmbrella99";
  const site = hostFor(baseURL, slug);
  await page.context().addCookies([
    { name: "marea-lang", value: "en", url: baseURL ?? "http://marea.localhost:3000" },
    { name: "marea-order-lang", value: "en", url: site },
  ]);

  // Sign up. The form refuses a submit faster than a person could fill it.
  await page.goto("/admin/signup");
  await page.locator("#businessName").fill(`E2E ${run}`);
  await page.locator("#slug").fill(slug);
  await page.locator("#name").fill("E2E Owner");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#confirmPassword").fill(password);
  await page.waitForTimeout(2_500);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();

  // Before the email is confirmed, the restaurant's page does not exist.
  expect((await page.goto(`${site}/menu`))?.status()).toBe(404);

  // Confirm the email from the link the signup queued.
  await page.goto(verifyUrlFor(email));
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("link", { name: /sign in/i }).or(page.getByText(/confirmed/i)).first()).toBeVisible();

  // Sign in: a business that never finished the wizard lands in it.
  await page.goto("/admin/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin\/asistente\/1$/);

  // The wizard: details and hours later, two tables now, the menu from a CSV.
  await page.getByRole("button", { name: "I'll do this later" }).click();
  await expect(page).toHaveURL(/\/admin\/asistente\/2$/);
  await page.getByRole("button", { name: "I'll do this later" }).click();
  await expect(page).toHaveURL(/\/admin\/asistente\/3$/);
  await page.locator('input[name="quantity"]').fill("2");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/\/admin\/asistente\/4$/);

  await page.getByText("Import a menu from a file").click();
  await page.locator('input[type="file"][name="file"]').setInputFiles({ name: "menu.csv", mimeType: "text/csv", buffer: Buffer.from(MENU_CSV) });
  await page.getByRole("button", { name: "Review file" }).click();
  await expect(page.getByText(/2 new/)).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText(/Imported 2/)).toBeVisible();
  await page.getByRole("button", { name: "I'll do this later" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // A guest orders from the restaurant's own address.
  await page.goto(`${site}/menu`);
  await expect(page.getByText("Ceviche de prueba").first()).toBeVisible();
  await page.getByRole("button", { name: "Add", exact: true }).first().click();
  await page.getByRole("button", { name: /^Add — /, exact: false }).click();
  await page.getByRole("button", { name: /View cart/ }).click();
  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/menu\/checkout$/);
  await page.locator("#guestName").fill("First Guest");
  await page.locator("#guestPhone").fill("5551234567");
  await page.getByRole("button", { name: "Confirm order" }).click();
  await expect(page).toHaveURL(/\/o\/[^/]+$/);

  // And the owner sees it on the board, with the dish only this restaurant sells.
  await page.goto("/admin/pedidos");
  await expect(page.getByText("Ceviche de prueba").first()).toBeVisible();
});
