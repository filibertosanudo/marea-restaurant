// Numbers for docs/perf-baseline.md. One subcommand per figure, each prints
// JSON so a run before and a run after a phase can be compared line by line.
//
//   node scripts/perf/measure.mjs idle [screens] [seconds]
//   node scripts/perf/measure.mjs payload
//   node scripts/perf/measure.mjs latency [requests]
//   node scripts/perf/measure.mjs event
//   node scripts/perf/measure.mjs page-idle [/admin/pedidos|/admin/cocina] [seconds]
//
// Needs pg_stat_statements on the database being measured; all counts are
// "statements the app ran", not "connections", so they hold under any pooler.
import zlib from "node:zlib";
import { pool, login, BASE_URL, percentile, fakeIp, BID } from "./lib.mjs";

const [command, ...rest] = process.argv.slice(2);
const db = pool();

async function statementCount() {
  // Excludes this script's own bookkeeping so it never inflates the figure.
  const { rows } = await db.query(
    `select coalesce(sum(calls),0)::int as calls from pg_stat_statements
     where dbid = (select oid from pg_database where datname = current_database())
       and query not ilike '%pg_stat_statements%'`
  );
  return rows[0].calls;
}

async function topStatements(limit = 8) {
  const { rows } = await db.query(
    `select calls::int, left(regexp_replace(query, '[[:space:]]+', ' ', 'g'), 110) as query from pg_stat_statements
     where dbid = (select oid from pg_database where datname = current_database())
       and query not ilike '%pg_stat_statements%' order by calls desc limit $1`,
    [limit]
  );
  return rows;
}

async function reset() {
  await db.query("select pg_stat_statements_reset()");
}

function openStream(jar, url, sink) {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(url, { headers: { cookie: jar.header() }, signal: controller.signal });
      for await (const chunk of res.body) sink.bytes += chunk.length;
    } catch {
      // aborted at the end of the window
    }
  })();
  return controller;
}

async function idle(screens, seconds) {
  const jar = await login();
  await reset();
  const sink = { bytes: 0 };
  const streams = Array.from({ length: screens }, () => openStream(jar, `${BASE_URL}/api/orders/stream`, sink));
  const startedAt = Date.now();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const elapsed = (Date.now() - startedAt) / 1000;
  const calls = await statementCount();
  const top = await topStatements();
  streams.forEach((s) => s.abort());
  console.log(
    JSON.stringify({
      screens,
      seconds: Math.round(elapsed),
      statements: calls,
      perMinute: Math.round((calls / elapsed) * 60),
      perMinutePerScreen: Math.round((calls / elapsed / screens) * 60),
      sseBytesPerMinute: Math.round((sink.bytes / elapsed) * 60),
      top,
    })
  );
}

async function fetchSize(url, headers) {
  const started = performance.now();
  const res = await fetch(url, { headers: { ...headers, "accept-encoding": "identity" } });
  const raw = Buffer.from(await res.arrayBuffer());
  return { status: res.status, ms: Math.round(performance.now() - started), rawBytes: raw.length, gzipBytes: zlib.gzipSync(raw).length };
}

async function payload() {
  const jar = await login();
  const cookie = { cookie: jar.header() };
  const { rows } = await db.query(
    `select count(*)::int n from "Order" where "businessId" = ${BID} and status not in ('DELIVERED','CANCELLED')`
  );
  await reset();
  const html = await fetchSize(`${BASE_URL}/admin/pedidos`, cookie);
  const queriesForHtml = await statementCount();
  await reset();
  // What router.refresh() actually downloads on every event: the RSC payload
  // of the same route (no router-state header, so the full tree, like a refresh).
  const rsc = await fetchSize(`${BASE_URL}/admin/pedidos`, { ...cookie, rsc: "1" });
  const queriesForRsc = await statementCount();
  console.log(JSON.stringify({ liveOrders: rows[0].n, html, queriesForHtml, rsc, queriesForRsc }));
}

/** What one live event costs a screen: the one-card read the board makes now, against re-rendering the page. */
async function event() {
  const jar = await login();
  const cookie = { cookie: jar.header() };
  const { rows } = await db.query(`select id from "Order" where "businessId" = ${BID} and status = 'PENDING' order by "placedAt" limit 1`);
  await reset();
  const card = await fetchSize(`${BASE_URL}/api/orders/board?ids=${rows[0].id}`, cookie);
  const cardStatements = await statementCount();
  await reset();
  const page = await fetchSize(`${BASE_URL}/admin/pedidos`, { ...cookie, rsc: "1" });
  const pageStatements = await statementCount();
  const live = await db.query(`select count(*)::int n from "Order" where "businessId" = ${BID} and status in ('PENDING','PREPARING','READY')`);
  console.log(JSON.stringify({ liveOrders: live.rows[0].n, card: { ...card, statements: cardStatements }, page: { ...page, statements: pageStatements } }));
}

/** A real browser on a real screen, idle: statements per minute once its first paint is over. */
async function pageIdle(path, seconds) {
  const { chromium } = await import("@playwright/test");
  const jar = await login();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addCookies(jar.header().split("; ").map((c) => ({ name: c.slice(0, c.indexOf("=")), value: c.slice(c.indexOf("=") + 1), url: BASE_URL })));
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}${path}`);
  await new Promise((r) => setTimeout(r, 10_000)); // first paint, the delivered column, the stream opening
  await reset();
  const startedAt = Date.now();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const elapsed = (Date.now() - startedAt) / 1000;
  const calls = await statementCount();
  const top = await topStatements(6);
  await browser.close();
  console.log(JSON.stringify({ path, seconds: Math.round(elapsed), statements: calls, perMinute: +((calls / elapsed) * 60).toFixed(1), top }));
}

async function latency(requests) {
  const out = {};
  for (const path of ["/", "/menu"]) {
    await reset();
    const times = [];
    let first = null;
    for (let i = 0; i < requests; i++) {
      const started = performance.now();
      const res = await fetch(`${BASE_URL}${path}`, { headers: { "x-forwarded-for": fakeIp(i + 1) } });
      await res.arrayBuffer();
      const ms = performance.now() - started;
      if (i === 0) first = ms;
      else times.push(ms);
    }
    times.sort((a, b) => a - b);
    out[path] = {
      firstRequestMs: Math.round(first),
      warmMedianMs: Math.round(percentile(times, 50)),
      warmP95Ms: Math.round(percentile(times, 95)),
      queriesPerRequest: +(((await statementCount()) / requests).toFixed(1)),
    };
  }
  console.log(JSON.stringify(out));
}

try {
  if (command === "idle") await idle(Number(rest[0] ?? 1), Number(rest[1] ?? 60));
  else if (command === "payload") await payload();
  else if (command === "latency") await latency(Number(rest[0] ?? 50));
  else if (command === "event") await event();
  else if (command === "page-idle") await pageIdle(rest[0] ?? "/admin/pedidos", Number(rest[1] ?? 130));
  else throw new Error("usage: measure.mjs idle|payload|latency|event|page-idle");
} finally {
  await db.end();
}
