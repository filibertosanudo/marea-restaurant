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
          // `npm run build` before testing double-counts them.
          exclude: ["**/node_modules/**", "**/.next/**", "**/*.integration.test.ts"],
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
        },
      },
    ],
  },
});
