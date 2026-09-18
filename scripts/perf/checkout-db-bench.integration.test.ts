// Checkout throughput on the database path alone, no HTTP in between, so lock
// contention is not hidden behind the Node server. Skipped unless BENCH_OUT is
// set, so it never runs with the suite.
//
//   BENCH_OUT=/tmp/bench.txt CONC=4 NN=40 DATABASE_POOL_MAX=25 \
//     npx vitest run scripts/perf/checkout-db-bench
//
// On localhost a round trip costs nothing and this shows no difference between
// folio strategies. Point DATABASE_URL at scripts/perf/delay-proxy.mjs to
// stand in for a hosted database, where the time a lock is held is what counts.
import { appendFileSync } from "node:fs";
import { it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeMenuCategory, makeMenuItem, makeCart } from "@/test/factories";
import { checkout } from "@/test/checkout";

it.skipIf(!process.env.BENCH_OUT)(
  "checkout throughput",
  async () => {
    const business = await makeBusiness({ timezone: "UTC" });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);
    const total = Number(process.env.NN ?? 160);
    const carts: Awaited<ReturnType<typeof makeCart>>[] = [];
    for (let i = 0; i < total; i++) {
      const cart = await makeCart(business.id);
      await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });
      carts.push(cart);
    }

    const latencies: number[] = [];
    const startedAt = performance.now();
    let next = 0;
    await Promise.all(
      Array.from({ length: Number(process.env.CONC ?? 8) }, async () => {
        while (next < total) {
          const i = next++;
          const t = performance.now();
          await checkout(carts[i], business);
          latencies.push(performance.now() - t);
        }
      })
    );
    const seconds = (performance.now() - startedAt) / 1000;
    latencies.sort((a, b) => a - b);
    const result = {
      ordersPerSecond: +(total / seconds).toFixed(1),
      p50Ms: Math.round(latencies[Math.floor(total * 0.5)]),
      p95Ms: Math.round(latencies[Math.floor(total * 0.95)]),
    };
    appendFileSync(process.env.BENCH_OUT!, `${JSON.stringify(result)}\n`);
  },
  300_000
);
