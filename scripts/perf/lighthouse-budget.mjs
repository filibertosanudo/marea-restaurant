// The public landing's performance budget: LCP under 2.5 s and CLS under 0.1
// on Lighthouse's Slow 4G profile, median of a few runs, exit 1 if either is
// over. Runs against a server that is already up (CI: the compose stack).
//
//   node scripts/perf/lighthouse-budget.mjs [url=http://localhost:3000/] [runs=3]
//
// Throttling is applied by Chrome (`devtools`), not estimated by Lighthouse's
// simulator: the simulator prices this page by the total JS it downloads, so
// it reads about 1 s slower than a real Slow 4G load and moves with the CI
// runner's CPU. The simulated figure is printed too, for information only.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const url = process.argv[2] ?? "http://localhost:3000/";
const runs = Number(process.argv[3] ?? 3);
const LCP_BUDGET_MS = Number(process.env.LCP_BUDGET_MS ?? 2500); // the override exists to prove the gate can fail
const CLS_BUDGET = 0.1;
const LIGHTHOUSE = "lighthouse@12.8.2";

const out = join("node_modules", ".cache", "lighthouse-budget");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

async function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const { chromium } = await import("@playwright/test");
  return chromium.executablePath();
}

function run(method, index) {
  const file = join(out, `${method}-${index}.json`);
  execFileSync(
    "npx",
    ["--yes", LIGHTHOUSE, url, "--only-categories=performance", `--throttling-method=${method}`, "--output=json", `--output-path=${file}`, "--chrome-flags=--headless=new --no-sandbox", "--quiet"],
    { stdio: "ignore", shell: process.platform === "win32", env: { ...process.env, CHROME_PATH: CHROME } }
  );
  const audits = JSON.parse(readFileSync(file, "utf8")).audits;
  return { lcp: audits["largest-contentful-paint"].numericValue, cls: audits["cumulative-layout-shift"].numericValue };
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const CHROME = await chromePath();

const applied = Array.from({ length: runs }, (_, i) => run("devtools", i + 1));
const simulated = Array.from({ length: runs }, (_, i) => run("simulate", i + 1));

const lcp = median(applied.map((r) => r.lcp));
const cls = Math.max(...applied.map((r) => r.cls));
console.log(`applied Slow 4G, ${runs} runs: LCP median ${(lcp / 1000).toFixed(2)} s (budget ${LCP_BUDGET_MS / 1000} s), worst CLS ${cls.toFixed(3)} (budget ${CLS_BUDGET})`);
console.log(`simulated Slow 4G, ${runs} runs (information only): LCP median ${(median(simulated.map((r) => r.lcp)) / 1000).toFixed(2)} s`);

const failures = [];
if (lcp >= LCP_BUDGET_MS) failures.push(`LCP ${(lcp / 1000).toFixed(2)} s is over ${LCP_BUDGET_MS / 1000} s`);
if (cls >= CLS_BUDGET) failures.push(`CLS ${cls.toFixed(3)} is over ${CLS_BUDGET}`);
if (failures.length > 0) {
  console.error(`Performance budget exceeded: ${failures.join("; ")}`);
  process.exit(1);
}
console.log("Performance budget met.");
