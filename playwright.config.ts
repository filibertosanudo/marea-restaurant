import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against the module 7/8 docker-compose stack (`docker compose up`
 * plus `docker compose run --rm seed`), never against `next dev` — the app
 * container's own build is what a real deployment runs, so this is the one
 * suite that would notice a `standalone` output-tracing gap or an
 * env-only-in-Docker bug that `next dev` on a laptop never would.
 */
export default defineConfig({
  testDir: "./e2e",
  // The three specs each own disjoint state (their own new order, their
  // own new reservation, the one seeded A-0001) — nothing here needs the
  // serialization a shared fixture would.
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 3 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
