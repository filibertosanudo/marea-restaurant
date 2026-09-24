// A service, not a benchmark: orders arrive spread over the run at random, five
// board screens stay connected the whole time, and guests keep reading the
// public menu in the background. Everything goes through the real HTTP path
// (proxy, auth, Server Actions), so what is measured is what a Friday is.
//
//   node scripts/perf/load-test.mjs [orders=200] [minutes=10] [screens=5] [--legacy]
//
// Pass/fail, the four criteria of module 16:
//   1. no error, no duplicate folio, no order missing from any board
//   2. checkout p95 under 800 ms
//   3. Postgres connections stable (bounded, not growing)
//   4. the boards still receive events at the end
//
// --legacy is for the build before module 16, whose stream sends a bare "update"
// with no order ids: the per-order coverage check is skipped (it cannot be
// made) and the rest is the same.
import { pool, actionIds, login, prepareCart, submitCheckout, percentile, fakeIp, BASE_URL } from "./lib.mjs";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const legacy = process.argv.includes("--legacy");
const orders = Number(args[0] ?? 200);
const minutes = Number(args[1] ?? 10);
const screens = Number(args[2] ?? 5);
const CHECKOUT_P95_BUDGET_MS = 800;
const POOL_MAX = Number(process.env.DATABASE_POOL_MAX ?? 25);

const ids = actionIds();
const db = pool(3);
const admin = await login();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const startedAt = Date.now();
const elapsed = () => Math.round((Date.now() - startedAt) / 1000);

const { rows: dishes } = await db.query(
  `select id from "MenuItem" where "isAvailable" and "deletedAt" is null and "trackInventory" = false order by id`
);
const itemIds = dishes.map((r) => r.id);

// ---------------------------------------------------------------- screens
/**
 * A board screen: an SSE connection, kept the way the browser hook keeps it. On
 * the server's scheduled handoff the replacement is opened before the old stream
 * is let go (the server keeps it delivering for a few seconds), so no event falls
 * in a gap; a stream that ends without a handoff is reopened after a short wait.
 */
function openScreen(index) {
  const screen = { index, seen: new Set(), updates: 0, reconciles: 0, lastUpdateAt: 0, drops: 0, stop: false };
  async function read() {
    let handedOff = false;
    try {
      const res = await fetch(`${BASE_URL}/api/orders/stream`, { headers: { cookie: admin.header() } });
      const decoder = new TextDecoder();
      let buffer = "";
      for await (const chunk of res.body) {
        if (screen.stop) return;
        buffer += decoder.decode(chunk, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (/^event: reconnect$/m.test(block)) {
            handedOff = true;
            void read(); // make before break
            continue;
          }
          if (!/^event: update$/m.test(block)) continue;
          screen.updates += 1;
          screen.lastUpdateAt = Date.now();
          const data = /^data: (.+)$/m.exec(block)?.[1];
          try {
            const body = JSON.parse(data);
            if (body.reconcile) screen.reconciles += 1;
            for (const change of body.changes ?? []) if (change.orderId) screen.seen.add(change.orderId);
          } catch {
            // the pre-module-16 stream sends a bare timestamp
          }
        }
      }
    } catch {
      screen.drops += 1;
    }
    if (!handedOff && !screen.stop) {
      await sleep(300);
      void read();
    }
  }
  void read();
  return screen;
}
const boards = Array.from({ length: screens }, (_, i) => openScreen(i));
await sleep(1500);

// ------------------------------------------------------ background traffic
const background = { requests: 0, errors: 0, latencies: [] };
let backgroundRunning = true;
(async () => {
  let n = 0;
  while (backgroundRunning) {
    const path = n++ % 3 === 0 ? "/" : "/menu";
    const t = performance.now();
    try {
      const res = await fetch(`${BASE_URL}${path}`, { headers: { "x-forwarded-for": fakeIp(3_000_000 + (n % 5000)) } });
      await res.arrayBuffer();
      if (res.status !== 200) background.errors += 1;
    } catch {
      background.errors += 1;
    }
    background.requests += 1;
    background.latencies.push(performance.now() - t);
    await sleep(400 + Math.random() * 400);
  }
})();

// ----------------------------------------------------------- connections
const connections = [];
const sampler = setInterval(async () => {
  try {
    const { rows } = await db.query(`select count(*)::int n from pg_stat_activity where datname = current_database()`);
    connections.push(rows[0].n);
  } catch {
    // a sample missed is a sample missed
  }
}, 5000);

// --------------------------------------------------------------- orders
const arrivals = Array.from({ length: orders }, () => Math.random() * minutes * 60_000).sort((a, b) => a - b);
const results = [];
const ipBase = 4_000_000 + Math.floor(Math.random() * 5_000_000);
console.log(`${elapsed()}s  ${orders} orders over ${minutes} min, ${screens} screens${legacy ? " (legacy stream)" : ""}`);

const inFlight = [];
for (let i = 0; i < orders; i++) {
  const wait = arrivals[i] - (Date.now() - startedAt - 1500);
  if (wait > 0) await sleep(wait);
  inFlight.push(
    (async () => {
      const ip = fakeIp(ipBase + i);
      try {
        const jar = await prepareCart({ ids, itemIds, ip, index: i });
        const t = performance.now();
        const token = await submitCheckout({ ids, jar, ip, index: i });
        results.push({ ok: true, ms: performance.now() - t, token });
      } catch (err) {
        results.push({ ok: false, ms: 0, error: String(err.message).slice(0, 140) });
      }
    })()
  );
  if ((i + 1) % 25 === 0) console.log(`${elapsed()}s  ${i + 1} placed, ${results.filter((r) => !r.ok).length} failed`);
}
await Promise.all(inFlight);
await sleep(4000); // let the last events reach the screens

// ------------------------------------------------------------ verification
const tokens = results.filter((r) => r.ok).map((r) => r.token);
const { rows: created } = await db.query(`select id, "orderNumber" from "Order" where "publicToken" = any($1)`, [tokens]);
const { rows: dupes } = await db.query(
  `select "orderNumber", count(*)::int n from "Order" group by 1 having count(*) > 1`
);
const createdIds = created.map((r) => r.id);
const missing = boards.map((b) => createdIds.filter((id) => !b.seen.has(id)).length);

// Still live at the end: one more change, every screen must hear about it.
const beforeFinal = boards.map((b) => b.updates);
await (async () => {
  const jar = await prepareCart({ ids, itemIds, ip: fakeIp(ipBase + orders + 1), index: 1 });
  await submitCheckout({ ids, jar, ip: fakeIp(ipBase + orders + 1), index: 1 });
})();
const deadline = Date.now() + 15_000;
while (Date.now() < deadline && boards.some((b, i) => b.updates <= beforeFinal[i])) await sleep(100);
const stillLive = boards.every((b, i) => b.updates > beforeFinal[i]);

backgroundRunning = false;
clearInterval(sampler);
boards.forEach((b) => (b.stop = true));

const latencies = results.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);
const bg = [...background.latencies].sort((a, b) => a - b);
const summary = {
  minutes,
  orders: { attempted: orders, created: created.length, failed: results.filter((r) => !r.ok).length, firstError: results.find((r) => !r.ok)?.error ?? null },
  checkoutMs: { p50: Math.round(percentile(latencies, 50)), p95: Math.round(percentile(latencies, 95)), p99: Math.round(percentile(latencies, 99)), max: Math.round(latencies[latencies.length - 1] ?? 0) },
  duplicateFolios: dupes.length,
  background: { requests: background.requests, errors: background.errors, p95Ms: Math.round(percentile(bg, 95)) },
  connections: { min: Math.min(...connections), max: Math.max(...connections), first: connections[0], last: connections[connections.length - 1], samples: connections.length },
  boards: boards.map((b) => ({ updates: b.updates, reconciles: b.reconciles, drops: b.drops, missedOrders: legacy ? "n/a" : missing[b.index] })),
  stillLiveAtEnd: stillLive,
};
console.log(JSON.stringify(summary, null, 2));

const checks = {
  "no failed order": summary.orders.failed === 0 && summary.orders.created === orders,
  "no background error": background.errors === 0,
  "no duplicate folio": summary.duplicateFolios === 0,
  "no order missing from a board": legacy ? true : missing.every((m) => m === 0),
  [`checkout p95 under ${CHECKOUT_P95_BUDGET_MS} ms`]: summary.checkoutMs.p95 < CHECKOUT_P95_BUDGET_MS,
  "connections bounded and not growing": summary.connections.max <= POOL_MAX + 5 && summary.connections.last <= summary.connections.first + 5,
  "boards still receive events at the end": stillLive,
};
let failed = 0;
for (const [name, ok] of Object.entries(checks)) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}
await db.end();
process.exit(failed === 0 ? 0 : 1);
