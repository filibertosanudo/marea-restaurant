// Concurrent checkouts through the real Server Action. Carts are filled first
// (not timed), then every checkout is fired with a fixed number in flight, so
// what is measured is order creation under contention, not cart building.
//
//   node scripts/perf/checkout-load.mjs [orders=100] [concurrency=20]
import { pool, actionIds, prepareCart, submitCheckout, runPool, percentile, fakeIp } from "./lib.mjs";

const orders = Number(process.argv[2] ?? 100);
const concurrency = Number(process.argv[3] ?? 20);
// Fresh client addresses every run: the per-IP order limit (5 per 15 min)
// would otherwise reject a second run from the same fake guests.
const ipBase = 100_000 + Math.floor(Math.random() * 10_000_000);
const ids = actionIds();
const db = pool();

const { rows: dishes } = await db.query(
  `select id from "MenuItem" where "isAvailable" and "deletedAt" is null and "trackInventory" = false order by id`
);
const itemIds = dishes.map((r) => r.id);
const before = (await db.query(`select count(*)::int n from "Order"`)).rows[0].n;

const jars = await runPool(orders, 10, (i) => prepareCart({ ids, itemIds, ip: fakeIp(ipBase + i), index: i }));

let peakConnections = 0;
const sampler = setInterval(async () => {
  const { rows } = await db.query(`select count(*)::int n from pg_stat_activity where datname = current_database()`);
  peakConnections = Math.max(peakConnections, rows[0].n);
}, 250);

const startedAt = performance.now();
const results = await runPool(orders, concurrency, async (i) => {
  const t = performance.now();
  try {
    await submitCheckout({ ids, jar: jars[i], ip: fakeIp(ipBase + i), index: i });
    return { ok: true, ms: performance.now() - t };
  } catch (err) {
    return { ok: false, ms: performance.now() - t, error: String(err.message).slice(0, 120) };
  }
});
const seconds = (performance.now() - startedAt) / 1000;
clearInterval(sampler);

const latencies = results.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);
const after = (await db.query(`select count(*)::int n from "Order"`)).rows[0].n;
const duplicates = (
  await db.query(`select count(*)::int n from (select "orderNumber" from "Order" group by 1 having count(*) > 1) d`)
).rows[0].n;
const failures = results.filter((r) => !r.ok);

console.log(
  JSON.stringify({
    orders,
    concurrency,
    ok: latencies.length,
    failed: failures.length,
    ordersPerSecond: +(latencies.length / seconds).toFixed(1),
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    p99Ms: Math.round(percentile(latencies, 99)),
    ordersCreated: after - before,
    duplicateFolios: duplicates,
    peakConnections,
    firstError: failures[0]?.error ?? null,
  })
);
await db.end();
