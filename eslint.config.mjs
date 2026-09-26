import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { readFileSync } from "node:fs";

// The only files allowed to import the system client (lib/db/system.ts).
// lib/db/system-importers.test.ts checks the same list against the tree.
const systemPrismaImporters = JSON.parse(readFileSync(new URL("./config/system-prisma-importers.json", import.meta.url), "utf8"));

// systemPrisma connects as marea_worker: it reads ids across every business and
// is not bound to one. Reaching for it in an ordinary query returns data and
// passes tests, and quietly walks around the isolation. A new use is a
// decision: add the file to the list, in review.
const systemPrismaPattern = {
  group: ["**/db/system"],
  message:
    "systemPrisma is the cross-business client (role marea_worker). Use prisma inside runInTenant(), or add this file to config/system-prisma-importers.json and say why in the review.",
};

// The raw Stripe client acts on the platform's own account unless every call
// remembers to name the business's. lib/stripe/payments.ts is the way in: it
// takes the account as a required argument and adds it to each call.
const stripeClientPattern = {
  group: ["**/stripe/client"],
  message:
    "The raw Stripe client is private to lib/stripe/. Use stripeFor(account) from @/lib/stripe/payments: it names the connected account on every call.",
};
const stripeExempt = ["lib/stripe/**", "**/*.test.{ts,tsx}", "test/**", "e2e/**"];
const all = ["**/*.{ts,tsx,mjs}"];
const restrict = (...patterns) => ({ "no-restricted-imports": ["error", { patterns }] });

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
  // Later blocks replace earlier ones' rule options rather than add to them, so
  // each set of files below states everything that applies to it.
  { files: all, rules: restrict(systemPrismaPattern, stripeClientPattern) },
  { files: stripeExempt, rules: restrict(systemPrismaPattern) },
  { files: systemPrismaImporters, ignores: stripeExempt, rules: restrict(stripeClientPattern) },
];

export default config;
