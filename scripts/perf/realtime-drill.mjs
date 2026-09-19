// Drills the realtime path against a running server, over real HTTP and a real
// Postgres: how long a change takes to reach a screen, and what happens when
// the LISTEN connection is killed while changes keep coming.
//
//   node scripts/perf/realtime-drill.mjs latency [samples=10]
//   node scripts/perf/realtime-drill.mjs kill
//
// The screen does not reconnect when the server hands the stream off after
// SSE_MAX_LIFETIME_MS (75 s by default), so against a polling server, where each
// sample can take 10 s, ask for fewer samples.
//
// `kill` is the manual version of recovery.integration.test.ts: it terminates
// the server's LISTEN backend, changes an order while nobody is listening, and
// shows the screen still learns about it.
import { pool, actionIds, login, callAction, placeOrder, fakeIp, BASE_URL } from "./lib.mjs";

const mode = process.argv[2] ?? "latency";
const ids = actionIds();
const db = pool();
const admin = await login();
const started = performance.now();
const at = () => `${String(Math.round(performance.now() - started)).padStart(6)} ms`;

/** One board screen: an SSE connection whose `update` events are timestamped as they arrive. */
function openScreen() {
  const updates = [];
  const controller = new AbortController();
  (async () => {
    const res = await fetch(`${BASE_URL}/api/orders/stream`, { headers: { cookie: admin.header() }, signal: controller.signal });
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (process.env.DRILL_VERBOSE) console.log(`${at()}  sse: ${JSON.stringify(block).slice(0, 120)}`);
        const event = /^event: (.+)$/m.exec(block)?.[1];
        const data = /^data: (.+)$/m.exec(block)?.[1];
        if (event === "update") updates.push({ time: performance.now(), body: data ? JSON.parse(data) : {} });
      }
    }
  })().catch(() => {});
  return { updates, close: () => controller.abort() };
}

async function waitFor(condition, timeoutMs, label) {
  const deadline = performance.now() + timeoutMs;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

const { rows: dishes } = await db.query(
  `select id from "MenuItem" where "isAvailable" and "deletedAt" is null and "trackInventory" = false order by id`
);
const itemIds = dishes.map((r) => r.id);
const advance = (orderId) =>
  callAction({ id: ids.advanceOrderStatusAction, path: "/admin/pedidos", args: [orderId], jar: admin }).then((r) => r.arrayBuffer());
const orderIdFor = async (token) =>
  (await db.query(`select id from "Order" where "publicToken" = $1`, [token])).rows[0].id;
const listenBackends = async () =>
  (await db.query(`select pid from pg_stat_activity where application_name = 'marea_realtime_listen'`)).rows.map((r) => r.pid);

const screen = openScreen();
await new Promise((r) => setTimeout(r, 1500)); // let the server open its LISTEN connection
console.log(`${at()}  screen connected; LISTEN backends: ${(await listenBackends()).join(",") || "none"}`);

if (mode === "latency") {
  const samples = [];
  const count = Number(process.argv[3] ?? 10);
  for (let i = 0; i < count; i++) {
    const token = await placeOrder({ ids, itemIds, ip: fakeIp(900_000 + i + Math.floor(Math.random() * 1e5)), index: i });
    const orderId = await orderIdFor(token);
    const before = screen.updates.length;
    const t0 = performance.now();
    await advance(orderId);
    await waitFor(() => screen.updates.length > before, 15_000, "an update");
    samples.push(screen.updates[before].time - t0);
    if (process.env.DRILL_VERBOSE) console.log(`${at()}  sample ${i + 1}: ${Math.round(samples[i])} ms`);
    await new Promise((r) => setTimeout(r, 300));
  }
  samples.sort((a, b) => a - b);
  console.log(
    `${at()}  advance -> update on the screen, ${count} samples: median ${Math.round(samples[Math.floor(count / 2)])} ms, max ${Math.round(samples[count - 1])} ms`
  );
} else if (mode === "kill") {
  const token = await placeOrder({ ids, itemIds, ip: fakeIp(950_000 + Math.floor(Math.random() * 1e5)), index: 1 });
  const orderId = await orderIdFor(token);
  await new Promise((r) => setTimeout(r, 500));
  screen.updates.length = 0;

  const [pid] = await listenBackends();
  await db.query(`select pg_terminate_backend($1)`, [pid]);
  console.log(`${at()}  KILLED the LISTEN backend (pid ${pid})`);
  const gone = (await listenBackends()).length === 0;
  await advance(orderId); // NOTIFY goes to nobody: the connection is down
  console.log(`${at()}  advanced order while down (LISTEN backend absent: ${gone}); updates seen so far: ${screen.updates.length}`);

  await waitFor(() => screen.updates.some((u) => JSON.stringify(u.body).includes(orderId)), 15_000, "the missed change");
  const hit = screen.updates.find((u) => JSON.stringify(u.body).includes(orderId));
  console.log(`${at()}  screen learned about the order after recovery: ${JSON.stringify(hit.body)}`);
  console.log(`${at()}  LISTEN backend restored: ${(await listenBackends()).join(",") || "NO"}`);
}

screen.close();
await db.end();
process.exit(0);
