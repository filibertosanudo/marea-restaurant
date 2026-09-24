// The lock behind three ways of numbering an order, and nothing else: the same
// 25-statement transaction (about what checkout runs) with the number taken
//   A. from one shared row, early (the pre-module-16 folio: UPDATE Business ...)
//   B. from a per-day counter row, last thing before the insert (module 16)
//   C. from a Postgres SEQUENCE, which takes no row lock at all
//
// It measures the lock, not the app: no HTTP, no Prisma, no real queries. Point
// it at scripts/perf/delay-proxy.mjs to stand in for a database that is not on
// localhost, where the time a lock is held is what counts.
//
//   node scripts/perf/folio-lock-bench.mjs [port=5440] [concurrency=4] [transactions=200]
import pg from "pg";

const port = Number(process.argv[2] ?? 5440);
const concurrency = Number(process.argv[3] ?? 4);
const total = Number(process.argv[4] ?? 200);
const url = `postgresql://marea:marea_perf@localhost:${port}/marea`;
const STATEMENTS = 25;

const admin = new pg.Client({ connectionString: process.env.ADMIN_DATABASE_URL ?? "postgresql://marea:marea_perf@localhost:5440/marea" });
await admin.connect();
await admin.query(`
  DROP TABLE IF EXISTS perf_bench_shared, perf_bench_daily;
  DROP SEQUENCE IF EXISTS perf_bench_seq;
  CREATE TABLE perf_bench_shared (id int PRIMARY KEY, n int NOT NULL);
  INSERT INTO perf_bench_shared VALUES (1, 0);
  CREATE TABLE perf_bench_daily (d text PRIMARY KEY, n int NOT NULL);
  CREATE SEQUENCE perf_bench_seq;
`);

const VARIANTS = {
  "A  shared row, early (before)": { at: 9, sql: `UPDATE perf_bench_shared SET n = n + 1 WHERE id = 1 RETURNING n` },
  "B  daily counter, last (after)": {
    at: 18,
    sql: `INSERT INTO perf_bench_daily (d, n) VALUES ('2026-09-19', 1) ON CONFLICT (d) DO UPDATE SET n = perf_bench_daily.n + 1 RETURNING n`,
  },
  "C  sequence": { at: 18, sql: `SELECT nextval('perf_bench_seq')` },
};

async function run(variant) {
  const clients = await Promise.all(
    Array.from({ length: concurrency }, async () => {
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      return c;
    })
  );
  const latencies = [];
  let next = 0;
  const startedAt = performance.now();
  await Promise.all(
    clients.map(async (client) => {
      while (next < total) {
        next += 1;
        const t = performance.now();
        await client.query("BEGIN");
        for (let i = 1; i <= STATEMENTS; i++) await client.query(i === variant.at ? variant.sql : "SELECT 1");
        await client.query("COMMIT");
        latencies.push(performance.now() - t);
      }
    })
  );
  const seconds = (performance.now() - startedAt) / 1000;
  await Promise.all(clients.map((c) => c.end()));
  latencies.sort((a, b) => a - b);
  return { perSecond: +(total / seconds).toFixed(1), p50: Math.round(latencies[Math.floor(total / 2)]), p95: Math.round(latencies[Math.floor(total * 0.95)]) };
}

console.log(`port ${port}, ${concurrency} in flight, ${total} transactions of ${STATEMENTS} statements`);
for (const [name, variant] of Object.entries(VARIANTS)) {
  const runs = [];
  for (let i = 0; i < 3; i++) runs.push(await run(variant));
  runs.sort((a, b) => a.perSecond - b.perSecond);
  console.log(`${name.padEnd(34)} median ${String(runs[1].perSecond).padStart(7)} tx/s  (runs ${runs.map((r) => r.perSecond).join(", ")})  p50 ${runs[1].p50} ms  p95 ${runs[1].p95} ms`);
}
await admin.query(`DROP TABLE IF EXISTS perf_bench_shared, perf_bench_daily; DROP SEQUENCE IF EXISTS perf_bench_seq;`);
await admin.end();
