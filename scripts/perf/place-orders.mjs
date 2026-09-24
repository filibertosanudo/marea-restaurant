// Places N guest orders through the real checkout and leaves them PENDING.
//   node scripts/perf/place-orders.mjs [count=60]
import { pool, actionIds, placeOrder, fakeIp } from "./lib.mjs";
const n = Number(process.argv[2] ?? 60);
const ids = actionIds(); const db = pool();
const { rows } = await db.query(`select id from "MenuItem" where "isAvailable" and "deletedAt" is null and "trackInventory" = false order by id`);
const base = 2_000_000 + Math.floor(Math.random() * 1e6);
for (let i = 0; i < n; i++) await placeOrder({ ids, itemIds: rows.map((r) => r.id), ip: fakeIp(base + i), index: i });
const r = await db.query(`select status, count(*)::int n from "Order" group by status order by status`);
console.log(JSON.stringify(r.rows)); await db.end();
