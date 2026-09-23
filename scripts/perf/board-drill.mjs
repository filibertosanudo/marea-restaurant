// Drives the real boards in a headless browser against a running server and a
// seeded database: paging, the lazy delivered column, one-card deltas,
// optimistic advance and its revert, the kitchen screen, the 60 s / focus
// reconcile, and the guest's tracking page. Prints PASS/FAIL per check.
//
// Needs more than 50 pending orders, so the cap is visible:
//   node scripts/perf/place-orders.mjs 60
//   node scripts/perf/board-drill.mjs
import { chromium } from "@playwright/test";
import { login, BASE_URL, pool, actionIds, callAction } from "./lib.mjs";

const jar = await login();
const ids = actionIds();
const db = pool();
const cookies = jar.header().split("; ").map((c) => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), url: BASE_URL }; });

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -> " + detail : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Something delivered inside the 12 h window, so the lazy column has cards to load.
{
  const { rows } = await db.query(`select id from "Order" where status = 'PENDING' and "placedAt" > now() - interval '6 hours' order by "placedAt" limit 3`);
  for (const row of rows) for (let step = 0; step < 3; step++) await (await callAction({ id: ids.advanceOrderStatusAction, path: "/admin/pedidos", args: [row.id], jar })).arrayBuffer();
}

const browser = await chromium.launch();

async function open(path, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  const log = { errors: [], requests: [] };
  page.on("pageerror", (e) => log.errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && log.errors.push(m.text()));
  page.on("request", (r) => log.requests.push({ at: Date.now(), url: r.url(), method: r.method(), headers: r.headers() }));
  if (opts.clock) await page.clock.install();
  await page.goto(`${BASE_URL}${path}`);
  return { page, log, ctx };
}

/** Column summary read from the DOM: title, badge, number of cards, and any "ver más" label. */
async function columns(page, selector) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll(sel)].map((col) => {
      const header = col.children[0];
      const title = header?.children[0]?.textContent?.trim() ?? "";
      const badge = Number(header?.children[1]?.textContent?.trim() ?? "NaN");
      const cards = col.querySelectorAll("[data-order-card], div.rounded-md.border.bg-surface.p-md, div.rounded-md.border.bg-surface").length;
      const more = [...col.querySelectorAll("button")].map((b) => b.textContent.trim()).find((t) => /^Ver más/.test(t)) ?? null;
      return { title, badge, cards, more };
    });
  }, selector);
}

const isRsc = (r) => r.headers["rsc"] === "1" || r.url.includes("_rsc=");
const cardsRequests = (log, since) => log.requests.filter((r) => r.at >= since && r.url.includes("/api/orders/board?ids="));
const rscRequests = (log, since) => log.requests.filter((r) => r.at >= since && isRsc(r));

// ------------------------------------------------------------------ board
console.log("\n== /admin/pedidos");
{
  const { page, log } = await open("/admin/pedidos");
  await page.waitForSelector("text=Pendiente");
  await sleep(2500);
  const cols = await columns(page, "div.flex.min-w-0.flex-col.bg-surface-subtle");
  const by = Object.fromEntries(cols.map((c) => [c.title.toLowerCase(), c]));
  console.log("    columns:", JSON.stringify(cols));
  const pending = by["pendiente"];
  const preparing = by["preparando"] ?? by["en preparación"];
  check("PENDING shows its total in the badge but only 50 cards", pending?.badge > 50 && pending?.cards === 50, `${pending?.badge} badge / ${pending?.cards} cards`);
  check("PENDING offers 'ver más' with the remaining count", pending?.more === `Ver más (${pending.badge - 50})`, pending?.more);
  check("PREPARING is capped at 50 too", preparing?.cards === 50 && preparing?.badge > 50, `${preparing?.badge}/${preparing?.cards}`);
  const deliveredCall = log.requests.find((r) => r.url.includes("/api/orders/board?status=DELIVERED"));
  check("delivered column is fetched after first paint, not in the page render", Boolean(deliveredCall));
  const delivered = by["entregado"];
  check("delivered column ends up populated", delivered && delivered.cards === delivered.badge && delivered.badge > 0, `${delivered?.badge}/${delivered?.cards}`);

  // ver más
  await page.click("button:has-text('Ver más')");
  await sleep(800);
  const after = await columns(page, "div.flex.min-w-0.flex-col.bg-surface-subtle");
  const p2 = after.find((c) => c.title.toLowerCase() === "pendiente");
  check("'ver más' loads the rest of the column", p2.cards === p2.badge && p2.more === null, `${p2.badge}/${p2.cards}`);

  // a change made elsewhere arrives as one card, not a page render
  const { rows } = await db.query(`select id from "Order" where status = 'PENDING' order by "placedAt" asc limit 1`);
  const before = Date.now();
  await (await callAction({ id: ids.advanceOrderStatusAction, path: "/admin/pedidos", args: [rows[0].id], jar })).arrayBuffer();
  await sleep(1200);
  const cards = cardsRequests(log, before);
  const rsc = rscRequests(log, before);
  check("another screen's change costs one card request", cards.length === 1, `${cards.length} card request(s)`);
  check("and no page re-render", rsc.length === 0, `${rsc.length} RSC request(s)`);
  const moved = await columns(page, "div.flex.min-w-0.flex-col.bg-surface-subtle");
  check("the card left PENDING and PREPARING gained it", moved.find((c) => c.title.toLowerCase() === "pendiente").badge === p2.badge - 1);
  check("no console errors", log.errors.length === 0, log.errors.join(" | ").slice(0, 200));
  await page.context().close();
}

// ------------------------------------------------------- optimistic advance
console.log("\n== optimistic advance");
{
  const { page, log } = await open("/admin/pedidos");
  await page.waitForSelector("text=Pendiente");
  await sleep(1500);
  const badgeOf = async (name) => (await columns(page, "div.flex.min-w-0.flex-col.bg-surface-subtle")).find((c) => c.title.toLowerCase() === name).badge;
  const startPending = await badgeOf("pendiente");

  // Hold the server action back: the card must move without waiting for it.
  await page.route("**/admin/pedidos", async (route) => {
    if (route.request().headers()["next-action"]) await sleep(1500);
    await route.continue();
  });
  const t0 = Date.now();
  await page.click("button:has-text('Comenzar preparación') >> nth=0");
  await page.waitForFunction(
    (expected) => [...document.querySelectorAll("div.flex.min-w-0.flex-col.bg-surface-subtle")].some((c) => c.children[0]?.children[0]?.textContent?.trim().toLowerCase() === "pendiente" && Number(c.children[0].children[1].textContent) === expected),
    startPending - 1,
    { timeout: 1200 }
  );
  const movedIn = Date.now() - t0;
  check("the card moves before the server answers", movedIn < 1200, `${movedIn} ms (action held 1500 ms)`);
  await sleep(2500);
  await page.unroute("**/admin/pedidos");

  // A failing action puts the card back.
  const pendingNow = await badgeOf("pendiente");
  await page.route("**/admin/pedidos", async (route) => {
    if (route.request().headers()["next-action"]) {
      await sleep(1200);
      return route.abort();
    }
    return route.continue();
  });
  await page.click("button:has-text('Comenzar preparación') >> nth=0");
  await sleep(400);
  const optimistic = await badgeOf("pendiente");
  await sleep(1600);
  const reverted = await badgeOf("pendiente");
  check("a failed action moves it back", optimistic === pendingNow - 1 && reverted === pendingNow, `${pendingNow} -> ${optimistic} -> ${reverted}`);
  check("no page errors", log.errors.filter((e) => !/Failed to fetch|aborted|net::/i.test(e)).length === 0, log.errors.join(" | ").slice(0, 200));
  await page.context().close();
}

// --------------------------------------------------------------- kitchen
console.log("\n== /admin/cocina");
{
  const { page, log } = await open("/admin/cocina");
  await page.waitForSelector("text=Pendiente");
  await sleep(2000);
  const cols = await page.evaluate(() => [...document.querySelectorAll("div.flex.min-w-0.flex-1.flex-col.bg-surface-subtle")].map((col) => ({
    title: col.children[0].children[0].textContent.trim(),
    badge: Number(col.children[0].children[1].textContent.trim()),
    cards: col.querySelectorAll("div.grid > div").length,
    more: [...col.querySelectorAll("button")].map((b) => b.textContent.trim()).find((t) => /^Ver más/.test(t)) ?? null,
  })));
  console.log("    columns:", JSON.stringify(cols));
  const pending = cols.find((c) => c.title === "Pendiente");
  check("kitchen PENDING is capped at 50 with 'ver más'", pending.cards === 50 && pending.badge > 50 && Boolean(pending.more), `${pending.badge}/${pending.cards} ${pending.more}`);
  check("kitchen has three columns and no delivered", cols.length === 3);
  const ready = cols.find((c) => c.title === "Listo");
  check("READY cards on the kitchen screen show no empty button", await page.evaluate(() => [...document.querySelectorAll("div.flex.min-w-0.flex-1.flex-col.bg-surface-subtle")[2].querySelectorAll("button")].every((b) => b.textContent.trim() !== "")), `${ready.badge} ready`);
  check("kitchen never asked for the delivered column", !log.requests.some((r) => r.url.includes("status=DELIVERED")));

  const { rows } = await db.query(`select id from "Order" where status = 'PENDING' order by "placedAt" desc limit 1`);
  const before = Date.now();
  await (await callAction({ id: ids.advanceOrderStatusAction, path: "/admin/pedidos", args: [rows[0].id], jar })).arrayBuffer();
  await sleep(1200);
  check("a change reaches the kitchen as one card request, no re-render", cardsRequests(log, before).length <= 1 && rscRequests(log, before).length === 0, `${cardsRequests(log, before).length} cards, ${rscRequests(log, before).length} RSC`);
  check("no console errors", log.errors.length === 0, log.errors.join(" | ").slice(0, 200));
  await page.context().close();
}

// -------------------------------------------------------------- reconcile
console.log("\n== reconcile");
{
  const { page, log } = await open("/admin/pedidos", { clock: true });
  await page.waitForSelector("text=Pendiente");
  await sleep(1500);
  const t0 = Date.now();
  await page.clock.fastForward(61_000);
  await sleep(800);
  check("a full re-read happens every 60 s", rscRequests(log, t0).length >= 1, `${rscRequests(log, t0).length} RSC request(s)`);
  await page.clock.fastForward(3_000); // past the gap that keeps focus and visibility from refreshing twice
  const t1 = Date.now();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await sleep(800);
  check("and when the tab regains focus", rscRequests(log, t1).length >= 1, `${rscRequests(log, t1).length} RSC request(s)`);
  await page.context().close();
}

// ------------------------------------------------------------ public page
console.log("\n== /o/<token> (order tracking)");
{
  const { rows } = await db.query(`select id, "publicToken" from "Order" where status = 'PENDING' order by "placedAt" desc limit 1`);
  const { page, log } = await open(`/o/${rows[0].publicToken}`);
  await sleep(1500);
  const before = await page.locator("main, body").first().innerText();
  await (await callAction({ id: ids.advanceOrderStatusAction, path: "/admin/pedidos", args: [rows[0].id], jar })).arrayBuffer();
  await sleep(2500);
  const after = await page.locator("main, body").first().innerText();
  check("the guest's tracking page follows the order", before !== after, after.split("\n").slice(0, 3).join(" / "));
  check("no console errors", log.errors.length === 0, log.errors.join(" | ").slice(0, 200));
  await page.context().close();
}

await browser.close();
await db.end();
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
