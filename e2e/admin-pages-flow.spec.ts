import { test, expect } from "@playwright/test";

/**
 * The admin screens that read across many tables at once: the cash shift and
 * its close receipt, the sales report and its export, settings, and the team.
 * Aggregations like these are the queries most likely to break under row level
 * security (the app connects as a restricted role and sees only its own
 * business), and none of the other specs touch them.
 *
 * One test, one login: sign-in is limited to five attempts per email per
 * fifteen minutes and the board spec already uses the same account.
 */
// The admin error boundary's own copy: a screen that failed to load shows it.
const ERROR_BOUNDARY = /Algo salió mal cargando esta sección/;

test("an admin works the cash shift, reads the report, settings and team", async ({ page, baseURL }) => {
  // Twelve screens in one session: generous for a cold `next dev`, and far more
  // than the production build the CI job runs against needs.
  test.setTimeout(120_000);
  await page.context().addCookies([{ name: "marea-lang", value: "en", url: baseURL }]);
  await page.goto("/admin/login");
  await page.locator("#email").fill("admin@marea.test");
  await page.locator("#password").fill("MareaAdmin123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await test.step("opens a cash shift, closes it, and reads the receipt", async () => {
    await page.goto("/admin/pedidos");
    // The header pill opens the drawer, whether or not a shift is already running.
    await page.getByRole("button", { name: /Open shift|Shift open/ }).first().click();
    const drawer = page.getByRole("dialog");
    const float = drawer.getByLabel("Opening float");
    if (await float.isVisible().catch(() => false)) {
      await float.fill("500");
      await drawer.getByRole("button", { name: "Open shift" }).click();
    }

    // The drawer stays open on the running shift.
    await expect(page.getByText("Expected by the system")).toBeVisible({ timeout: 15_000 });
    await page.getByLabel("Cash counted").fill("500");
    await page.getByRole("button", { name: "Close shift" }).click();

    await expect(page).toHaveURL(/\/admin\/reportes\/cortes\/.+/, { timeout: 20_000 });
    await expect(page.getByText("Cash close receipt")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });

  await test.step("the sales report renders and exports", async () => {
    await page.goto("/admin/reportes");
    await expect(page.getByRole("heading", { name: "Sales reports" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);

    // "month" holds the seeded orders. A report that came back with a header
    // row only would be a report that cannot see its own business. Fetched from
    // inside the page: the business is a subdomain, which the test runner's own
    // HTTP client may not resolve.
    for (const dataset of ["daily-sales", "dishes-by-units", "payment-methods"]) {
      const exported = await page.evaluate(async (name) => {
        const res = await fetch(`/api/admin/reports/export?dataset=${name}&range=month`);
        return { status: res.status, type: res.headers.get("content-type"), text: await res.text() };
      }, dataset);
      expect(exported.status, dataset).toBe(200);
      expect(exported.type).toContain("csv");
      if (dataset === "dishes-by-units") expect(exported.text.trim().split(/\s*\n\s*/).length).toBeGreaterThan(1);
    }
  });

  await test.step("settings and team load their own business's data", async () => {
    await page.goto("/admin/configuracion");
    await expect(page.getByRole("heading", { name: "Business settings" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);

    await page.goto("/admin/equipo");
    await expect(page.getByText("admin@marea.test")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(ERROR_BOUNDARY);
  });

  await test.step("every other admin section loads", async () => {
    for (const path of ["menu", "menu/categorias", "menu/modificadores", "mesas", "promociones", "reservaciones", "testimonios", "pedidos"]) {
      const response = await page.goto(`/admin/${path}`);
      expect(response?.status(), path).toBeLessThan(400);
      await expect(page.locator("body"), path).not.toContainText(ERROR_BOUNDARY);
    }
  });
});
