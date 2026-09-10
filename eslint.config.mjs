import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

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
];

export default config;
