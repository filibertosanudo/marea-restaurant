// End-to-end check of the public cache: an edit made through the real admin
// Server Action must show on /menu on the very next request, and an
// unrelated request must be served from the cache in between.
import { pool, actionIds, login, callAction, BASE_URL, fakeIp, BID } from "./lib.mjs";

const db = pool();
const ids = actionIds();
const admin = await login();

const { rows } = await db.query(
  `select i.id, t.name from "MenuItem" i join "MenuItemTranslation" t on t."menuItemId" = i.id and t.locale = 'en'
   where i."businessId" = ${BID} and i."isAvailable" and i."deletedAt" is null and i."trackInventory" = false order by i.id limit 1`
);
const { id, name } = rows[0];

async function menuHas(ip) {
  const res = await fetch(`${BASE_URL}/menu`, { headers: { "x-forwarded-for": ip } });
  return (await res.text()).includes(name);
}
async function timed(fn) {
  const started = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - started) };
}
async function statements(fn) {
  await db.query("select pg_stat_statements_reset()");
  const value = await fn();
  const { rows: r } = await db.query(
    `select coalesce(sum(calls),0)::int n from pg_stat_statements where query not ilike '%pg_stat_statements%'`
  );
  return { value, statements: r[0].n };
}

const out = {};
out.dish = name;
out.warmup = await timed(() => menuHas(fakeIp(1)));
out.cached = await statements(() => menuHas(fakeIp(2)));

const toggle = (available) => callAction({ id: ids.toggleAvailabilityAction, path: "/admin/menu", args: [id, available], jar: admin });
try {
  const hide = await timed(() => toggle(false).then((r) => r.arrayBuffer()));
  out.hideActionMs = hide.ms;
  out.afterHide = await timed(() => menuHas(fakeIp(3)));
  out.afterHide.statements = (await statements(() => menuHas(fakeIp(4)))).statements;
} finally {
  await (await toggle(true)).arrayBuffer();
}
out.afterRestore = await timed(() => menuHas(fakeIp(5)));
console.log(JSON.stringify(out, null, 2));
await db.end();
