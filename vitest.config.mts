import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "server-only": path.resolve(import.meta.dirname, "test/stubs/server-only.ts"),
    },
  },
  test: {
    // Higher bar for the money paths (per docs/CONVENCIONES.md's testing
    // rule); everything else in lib/** gets a lower floor instead of none,
    // since untested helper functions still rot silently otherwise.
    // components/** and app/** are deliberately excluded — see phase 5's
    // own note on why JSX coverage numbers don't buy real confidence.
    coverage: {
      provider: "v8",
      include: ["lib/**"],
      exclude: ["lib/generated/**"],
      thresholds: {
        "lib/orders/**": { statements: 90, branches: 90, functions: 90, lines: 90 },
        "lib/payments/**": { statements: 90, branches: 90, functions: 90, lines: 90 },
        "lib/reservations/**": { statements: 90, branches: 90, functions: 90, lines: 90 },
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
    // Unit tests are pure-function tests with no external state — fast,
    // parallel, no database. Integration tests need a real Postgres and
    // are named *.integration.test.ts to stay out of the unit project.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          setupFiles: ["./test/setup.ts"],
          // .next/standalone carries a traced copy of some source files,
          // test files included — without this, a machine that ran
          // `npm run build` before testing double-counts them. e2e/**'s
          // own *.spec.ts files (Playwright, not vitest) would otherwise
          // match vitest's default include pattern too.
          exclude: ["**/node_modules/**", "**/.next/**", "**/*.integration.test.ts", "e2e/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["**/*.integration.test.ts"],
          exclude: ["**/node_modules/**", "**/.next/**"],
          setupFiles: ["./test/setup.integration.ts"],
          // Every worker's first file (per worker, not per whole run — see
          // test/db.ts) shells out to `prisma migrate deploy`, and Prisma's
          // own migration advisory lock is scoped to the database, not the
          // schema each worker migrates — too many workers hitting it at
          // once starts timing out waiting for that single lock instead of
          // for anything this test suite actually owns.
          maxWorkers: 4,
          // Required the moment the two projects' maxWorkers differ —
          // vitest otherwise refuses to run, needing a distinct group per
          // differing pool option. The actual order doesn't matter here,
          // only that it's different from the unit project's (default 0).
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
