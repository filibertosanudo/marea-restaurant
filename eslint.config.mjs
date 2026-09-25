import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { readFileSync } from "node:fs";

// The only files allowed to import the system client (lib/db/system.ts).
// lib/db/system-importers.test.ts checks the same list against the tree.
const systemPrismaImporters = JSON.parse(readFileSync(new URL("./config/system-prisma-importers.json", import.meta.url), "utf8"));

const config = [
  {
    ignores: [
      "lib/generated/**",
      ".next/**",
      "**/dist/**",
      "coverage/**",
      "node_modules/**",
      ".ds-sync/**",
      "ds-bundle/**",
      ".agents/**",
      ".claude/**",
      ".design-sync/**",
      // Its own package, own tsconfig, own tooling — see agent/README.md.
      "agent/**",
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    // systemPrisma connects as marea_worker: it reads ids across every
    // business and is not bound to one. Reaching for it in an ordinary query
    // returns data and passes tests, and quietly walks around the isolation.
    // A new use is a decision: add the file to the list, in review.
    files: ["**/*.{ts,tsx,mjs}"],
    ignores: systemPrismaImporters,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/db/system"],
              message:
                "systemPrisma is the cross-business client (role marea_worker). Use prisma inside runInTenant(), or add this file to config/system-prisma-importers.json and say why in the review.",
            },
          ],
        },
      ],
    },
  },
];

export default config;
