import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";

/**
 * Two businesses on one deployment, seeded as marea and cala (the same chain).
 * Each business answers on its own subdomain, so these specs need the stack
 * served at <slug>.localhost (BUSINESS_ROOT_DOMAIN=localhost); the base URL is
 * marea's and cala's is derived from it. What they check is the promise of the
 * module: nothing crosses from one business to the other, and an owner of the
 * chain can move between them.
 */
function hostFor(baseURL: string | undefined, slug: string): string {
  const url = new URL(baseURL ?? "http://marea.localhost:3000");
  url.hostname = `${slug}.localhost`;
  return url.origin;
}

function orderTokens(): { marea: string; cala: string } {
  const output = execFileSync("npx", ["tsx", "e2e/scripts/get-fixtures.ts"], {
    env: process.env,
    encoding: "utf8",
    shell: true,
  });
  return JSON.parse(output.slice(output.indexOf("{")));
}

async function signIn(page: Page, baseURL: string | undefined, email: string, password: string) {
  await page.context().addCookies([{ name: "marea-lang", value: "en", url: baseURL ?? "http://marea.localhost:3000" }]);
  await page.goto("/admin/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("a guest sees the menu of the business whose address they opened, and its orders only", async ({ page, baseURL }) => {
  const cala = hostFor(baseURL, "cala");
  const tokens = orderTokens();

  await page.goto("/menu");
  await expect(page.getByText("Oyster Sampler").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Flat White");

  await page.goto(`${cala}/menu`);
  await expect(page.getByText("Flat White").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Oyster Sampler");

  // Each business's order link works on its own address...
  expect((await page.goto(`${cala}/o/${tokens.cala}`))?.status()).toBe(200);
  expect((await page.goto(`/o/${tokens.marea}`))?.status()).toBe(200);
  // ...and on the other's it is simply not found, token or no token.
  expect((await page.goto(`${cala}/o/${tokens.marea}`))?.status()).toBe(404);
  expect((await page.goto(`/o/${tokens.cala}`))?.status()).toBe(404);
});

test("cala's administrator works on cala and never sees marea", async ({ page, baseURL }) => {
  await signIn(page, baseURL, "admin@cala.test", "CalaAdmin123!");

  await page.goto("/admin/menu");
  await expect(page.getByText("Flat White").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Oyster Sampler");

  await page.goto("/admin/mesas");
  await expect(page.getByText("C-01").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("M-01");

  // The user menu offers no switcher: one business is all they may act on.
  await page.getByRole("button", { name: /Valeria/ }).click();
  await expect(page.locator("#switch-business")).toHaveCount(0);
});

test("the owner of the chain moves between the two businesses without signing in again", async ({ page, baseURL }) => {
  await signIn(page, baseURL, "owner@marea.test", "MareaOwner123!");

  const businessId = async () =>
    (await page.evaluate(async () => (await fetch("/api/auth/session")).json())).user.businessId as string;
  const first = await businessId();

  await page.goto("/admin/menu");
  // The switcher is a client component: choosing before it has hydrated does nothing.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Owner/ }).click();
  const switcher = page.locator("#switch-business");
  await expect(switcher).toBeVisible();
  const options = await switcher.locator("option").allTextContents();
  expect(options.sort()).toEqual(["Cala", "Marea"]);

  // The session starts on the chain's oldest business, marea; move to cala.
  await switcher.selectOption({ label: "Cala" });
  // The menu closes once the switch has gone through. Read the session only
  // after that and the refresh have settled: a session GET made while the
  // action's new cookie is still in flight is answered with the old token and
  // would write it back, which is the test tripping over itself, not the app.
  await expect(switcher).toHaveCount(0, { timeout: 15_000 });
  await page.waitForLoadState("networkidle");
  expect(await businessId()).not.toBe(first);

  await page.goto("/admin/menu");
  await expect(page.getByText("Flat White").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Oyster Sampler");

  // The chain-wide report names both branches.
  await page.goto("/admin/reportes/organizacion?range=month");
  await expect(page.getByRole("heading", { name: "Sales by branch" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Marea");
  await expect(page.locator("body")).toContainText("Cala");
});
