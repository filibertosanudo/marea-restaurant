#!/usr/bin/env bash
# Lighthouse (mobile, simulated slow 4G) on the landing, N runs, prints LCP/CLS/TBT per run and the median LCP.
#   scripts/perf/lh.sh [runs=3] [url=http://localhost:3100/]
set -e
RUNS="${1:-3}"
URL="${2:-http://localhost:3100/}"
OUT="node_modules/.cache/lighthouse"
rm -rf "$OUT"; mkdir -p "$OUT"
export CHROME_PATH="${CHROME_PATH:-C:\Program Files\Google\Chrome\Application\chrome.exe}"
for i in $(seq 1 "$RUNS"); do
  npx --yes lighthouse "$URL" --only-categories=performance --output=json --output-path="$OUT/run-$i.json" \
    --chrome-flags="--headless=new --no-sandbox" --quiet > /dev/null 2>&1
done
node -e '
const fs = require("fs"), dir = process.argv[1], runs = Number(process.argv[2]);
const lcps = [];
for (let i = 1; i <= runs; i++) {
  const a = JSON.parse(fs.readFileSync(`${dir}/run-${i}.json`, "utf8")).audits;
  const lcp = a["largest-contentful-paint"].numericValue; lcps.push(lcp);
  console.log(`run ${i}: LCP ${(lcp / 1000).toFixed(2)} s  CLS ${a["cumulative-layout-shift"].numericValue.toFixed(3)}  TBT ${Math.round(a["total-blocking-time"].numericValue)} ms  bytes ${Math.round(a["total-byte-weight"].numericValue / 1024)} KiB`);
}
lcps.sort((x, y) => x - y);
console.log(`median LCP ${(lcps[Math.floor(lcps.length / 2)] / 1000).toFixed(2)} s`);
' "$OUT" "$RUNS"
