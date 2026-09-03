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
          exclude: ["**/node_modules/**", "**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["**/*.integration.test.ts"],
          setupFiles: ["./test/setup.integration.ts"],
        },
      },
    ],
  },
});
