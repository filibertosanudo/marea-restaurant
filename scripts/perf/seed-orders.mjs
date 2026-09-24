// Fills the dev database with a board that looks like a busy service: `live`
// orders spread across the live columns, plus a few delivered ones. Placed
// through the real checkout, advanced through the real board action.
import { pool, actionIds, login, callAction, placeOrder, fakeIp } from "./lib.mjs";

const live = Number(process.argv[2] ?? 50);
const delivered = Number(process.argv[3] ?? 10);
const ids = actionIds();
const db = pool();
const admin = await login();

const { rows: dishes } = await db.query(
  `select id from "MenuItem" where "isAvailable" and "deletedAt" is null and "trackInventory" = false order by id`
);
const itemIds = dishes.map((r) => r.id);

const tokens = [];
for (let i = 0; i < live + delivered; i++) tokens.push(await placeOrder({ ids, itemIds, ip: fakeIp(1000 + i), index: i }));

const { rows: orders } = await db.query(
  `select id from "Order" where "publicToken" = any($1) order by "createdAt"`,
  [tokens]
);
// Live orders advance 0..2 steps (they stay on the board), the rest go all the way.
for (const [i, { id }] of orders.entries()) {
  const steps = i < live ? i % 3 : 8;
  for (let s = 0; s < steps; s++) {
    const res = await callAction({ id: ids.advanceOrderStatusAction, path: "/admin/pedidos", args: [id], jar: admin });
    await res.arrayBuffer();
  }
}
const { rows } = await db.query(`select status, count(*)::int n from "Order" group by status order by status`);
console.log(JSON.stringify(rows));
await db.end();
