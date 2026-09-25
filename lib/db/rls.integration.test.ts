import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { prisma as owner } from "@/lib/prisma";
import { TenantPool } from "@/lib/db/tenant-pool";
import { findRoleProblem } from "@/lib/db/role-check";
import { runInTenant, explicitTenant } from "@/lib/tenancy/context";
import { businessIdForPaymentIntent, businessIdForToken, businessIdForDeviceTokenHash } from "@/lib/tenancy/discover";
import { currentTenant } from "@/lib/tenancy/request-tenant";
import { setTestTenantHeader } from "@/test/stubs/next-headers";
import { testSchema } from "@/test/db";
import { makeBusiness, makeMenuCategory, makeMenuItem, makeOrder } from "@/test/factories";

// Row level security does nothing for the role that owns the tables, so every
// assertion here goes through a client that connects as `marea_app` (or
// `marea_worker`) instead of the harness's owner connection. The owner
// `prisma` is used only to arrange data and to check what really is in the
// tables. `role` in the connection options makes the session SET ROLE before
// anything runs, which any role that may become the target can do; no
// password is involved.

function urlAs(role: string): string {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${testSchema} -c role=${role}`);
  return url.toString();
}

// The lookups in lib/tenancy/discover.ts go through systemPrisma, which reads
// this. Set at load, before anything touches lib/env, so they run as the worker
// role like they do in the web process.
process.env.WORKER_DATABASE_URL = urlAs("marea_worker");

const pools: Array<{ end: () => Promise<void> }> = [];

function appClient(max = 5): PrismaClient {
  const pool = new TenantPool({ connectionString: urlAs("marea_app"), max }, () => explicitTenant());
  pools.push(pool);
  return new PrismaClient({ adapter: new PrismaPg(pool, { schema: testSchema }) });
}

function workerClient(): PrismaClient {
  const pool = new pg.Pool({ connectionString: urlAs("marea_worker"), max: 2 });
  pools.push(pool);
  return new PrismaClient({ adapter: new PrismaPg(pool, { schema: testSchema }) });
}

afterAll(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

async function twoBusinessesWithOrders() {
  const marea = await makeBusiness({ slug: "marea" });
  const cala = await makeBusiness({ slug: "cala" });
  const mareaOrder = await makeOrder(marea.id);
  const calaOrder = await makeOrder(cala.id);
  return { marea, cala, mareaOrder, calaOrder };
}

describe("the application role", () => {
  it("is not the owner of the tables and is not a superuser", async () => {
    await makeBusiness({ slug: "marea" });
    const app = appClient();

    const [who] = await runInTenant("any", () =>
      app.$queryRawUnsafe<Array<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>>(
        `SELECT current_user, r.rolsuper, r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user`
      )
    );
    const [table] = await owner.$queryRawUnsafe<Array<{ tableowner: string }>>(
      `SELECT tableowner FROM pg_tables WHERE schemaname = '${testSchema}' AND tablename = 'Order'`
    );

    // Shown on purpose: this is the evidence that the connection is subject to the policies.
    console.info("application connection:", who, "| Order owned by:", table.tableowner);
    expect(who.current_user).toBe("marea_app");
    expect(who.rolsuper).toBe(false);
    expect(who.rolbypassrls).toBe(false);
    expect(table.tableowner).not.toBe(who.current_user);
  });
});

describe("row level security on the application role", () => {
  it("hides another business's order even when the query forgot to filter by business", async () => {
    const { marea, mareaOrder, calaOrder } = await twoBusinessesWithOrders();
    const app = appClient();

    await runInTenant(marea.id, async () => {
      // No where: { businessId } anywhere: the policy alone has to hold.
      const all = await app.order.findMany();
      expect(all.map((o) => o.id)).toEqual([mareaOrder.id]);
      expect(await app.order.findUnique({ where: { id: calaOrder.id } })).toBeNull();
      expect(await app.order.count()).toBe(1);
    });
  });

  it("returns nothing at all when no business was set", async () => {
    await twoBusinessesWithOrders();
    const app = appClient();

    expect(await app.order.findMany()).toEqual([]);
    expect(await app.menuItem.findMany()).toEqual([]);
  });

  it("cannot update or delete another business's rows, and cannot write one into it", async () => {
    const { marea, cala, calaOrder } = await twoBusinessesWithOrders();
    const app = appClient();

    await runInTenant(marea.id, async () => {
      expect((await app.order.updateMany({ where: { id: calaOrder.id }, data: { notes: "hijacked" } })).count).toBe(0);
      expect((await app.order.deleteMany({ where: { id: calaOrder.id } })).count).toBe(0);
      await expect(app.order.update({ where: { id: calaOrder.id }, data: { notes: "hijacked" } })).rejects.toThrow();
      // WITH CHECK: a row for the other business is refused outright.
      await expect(
        app.restaurantTable.create({ data: { businessId: cala.id, code: "X1", qrToken: "forged" } })
      ).rejects.toThrow(/row-level security/);
    });

    const untouched = await owner.order.findUniqueOrThrow({ where: { id: calaOrder.id } });
    expect(untouched.notes).not.toBe("hijacked");
  });

  it("hides child rows that carry no businessId of their own", async () => {
    const { marea, mareaOrder, calaOrder } = await twoBusinessesWithOrders();
    const line = (orderId: string) =>
      owner.orderItem.create({
        data: { orderId, nameSnapshot: "Ceviche", unitPrice: "10.00", quantity: 1, lineTotal: "10.00" },
      });
    const mine = await line(mareaOrder.id);
    const theirs = await line(calaOrder.id);
    const app = appClient();

    await runInTenant(marea.id, async () => {
      expect((await app.orderItem.findMany()).map((i) => i.id)).toEqual([mine.id]);
      expect(await app.orderItem.findUnique({ where: { id: theirs.id } })).toBeNull();
      await expect(
        app.orderItem.create({
          data: { orderId: calaOrder.id, nameSnapshot: "Forged", unitPrice: "1.00", quantity: 1, lineTotal: "1.00" },
        })
      ).rejects.toThrow(/row-level security/);
    });
  });

  it("shows each business only its own Business row, and lets only that row change", async () => {
    const { marea, cala } = await twoBusinessesWithOrders();
    const app = appClient();

    // Nobody set: nothing, not even the public name.
    expect(await app.business.findMany()).toEqual([]);

    await runInTenant(marea.id, async () => {
      expect((await app.business.findMany({ select: { slug: true } })).map((b) => b.slug)).toEqual(["marea"]);
      expect(await app.business.findUnique({ where: { id: cala.id } })).toBeNull();
      expect((await app.business.updateMany({ where: { id: cala.id }, data: { name: "Hijacked" } })).count).toBe(0);
      expect((await app.business.updateMany({ where: { id: marea.id }, data: { name: "Renamed" } })).count).toBe(1);
      await expect(app.business.create({ data: { name: "Third", slug: "third" } as never })).rejects.toThrow();
    });
  });

  it("resolves a host to an id, and only an id, before any business is known", async () => {
    const { marea, cala } = await twoBusinessesWithOrders();
    await owner.business.update({ where: { id: cala.id }, data: { email: "owner@cala.example", stripeAccountId: "acct_secret" } });
    const app = appClient();

    // Outside any business the table shows nothing...
    expect(await app.business.count()).toBe(0);
    // ...and the functions answer with an id or a count, no columns.
    const [bySlug] = await app.$queryRaw<Array<{ id: string | null }>>`SELECT marea_business_id_by_slug('cala') AS id`;
    const [unknown] = await app.$queryRaw<Array<{ id: string | null }>>`SELECT marea_business_id_by_slug('nope') AS id`;
    const [only] = await app.$queryRaw<Array<{ id: string | null }>>`SELECT marea_only_business_id() AS id`;
    const [count] = await app.$queryRaw<Array<{ n: number }>>`SELECT marea_business_count() AS n`;
    expect(bySlug.id).toBe(cala.id);
    expect(unknown.id).toBeNull();
    expect(only.id).toBeNull(); // two businesses: no default
    expect(count.n).toBe(2);
    expect(marea.id).not.toBe(cala.id);
  });

  it("keeps the business inside an interactive transaction", async () => {
    const { marea, mareaOrder, calaOrder } = await twoBusinessesWithOrders();
    const app = appClient();

    await runInTenant(marea.id, () =>
      app.$transaction(async (tx) => {
        expect((await tx.order.findMany()).map((o) => o.id)).toEqual([mareaOrder.id]);
        expect(await tx.order.findUnique({ where: { id: calaOrder.id } })).toBeNull();
        // Raw SQL, as the checkout's row lock does, obeys the policy too.
        const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(`SELECT id FROM "Order" FOR UPDATE`);
        expect(locked.map((o) => o.id)).toEqual([mareaOrder.id]);
      })
    );
  });

  it("never lets a pooled connection carry one business's setting into the next caller", async () => {
    const { marea, cala, mareaOrder, calaOrder } = await twoBusinessesWithOrders();
    // One connection only: every call below reuses the same socket, which is
    // exactly the situation where a leftover setting would leak.
    const app = appClient(1);

    const ids = async (business: string | null) =>
      (business ? await runInTenant(business, () => app.order.findMany()) : await app.order.findMany())
        .map((o) => o.id)
        .sort();

    expect(await ids(marea.id)).toEqual([mareaOrder.id]);
    expect(await ids(cala.id)).toEqual([calaOrder.id]);
    expect(await ids(null)).toEqual([]);
    expect(await ids(marea.id)).toEqual([mareaOrder.id]);
  });

  it("leaves no business on a connection that goes back to the pool, so forgetting to set one sees nothing", async () => {
    const { marea, mareaOrder } = await twoBusinessesWithOrders();
    const pool = new TenantPool({ connectionString: urlAs("marea_app"), max: 1 }, () => explicitTenant());
    pools.push(pool);
    const app = new PrismaClient({ adapter: new PrismaPg(pool, { schema: testSchema }) });

    // Business A uses the only connection there is, and it goes back.
    await runInTenant(marea.id, async () => {
      expect((await app.order.findMany()).map((o) => o.id)).toEqual([mareaOrder.id]);
    });

    // A path that does not set a business: the pool's own connect, skipping
    // TenantPool's. It is handed the very same connection.
    const forgetful = await (pg.Pool.prototype.connect as () => Promise<pg.PoolClient>).call(pool);
    try {
      const setting = await forgetful.query("SELECT current_setting('app.business_id', true) AS value");
      expect(setting.rows[0].value).toBe("");
      const visible = await forgetful.query(`SELECT count(*)::int AS n FROM "${testSchema}"."Order"`);
      expect(visible.rows[0].n).toBe(0);
    } finally {
      forgetful.release();
    }
  });

  it("keeps concurrent callers of different businesses apart", async () => {
    const { marea, cala, mareaOrder, calaOrder } = await twoBusinessesWithOrders();
    const app = appClient(2);

    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => {
        const business = i % 2 === 0 ? marea : cala;
        return runInTenant(business.id, async () => ({
          business: business.id,
          orders: (await app.order.findMany()).map((o) => o.id),
        }));
      })
    );

    for (const r of results) {
      expect(r.orders).toEqual([r.business === marea.id ? mareaOrder.id : calaOrder.id]);
    }
  });
});

describe("the business of a request", () => {
  it("comes from the header proxy.ts stamps, and an explicit scope wins over it", async () => {
    const { marea, cala, mareaOrder, calaOrder } = await twoBusinessesWithOrders();
    const pool = new TenantPool({ connectionString: urlAs("marea_app"), max: 2 }, currentTenant);
    pools.push(pool);
    const app = new PrismaClient({ adapter: new PrismaPg(pool, { schema: testSchema }) });

    // No header, no scope: nothing.
    expect(await app.order.findMany()).toEqual([]);

    setTestTenantHeader(marea.id);
    expect((await app.order.findMany()).map((o) => o.id)).toEqual([mareaOrder.id]);

    const inside = await runInTenant(cala.id, () => app.order.findMany());
    expect(inside.map((o) => o.id)).toEqual([calaOrder.id]);
  });
});

describe("finding the business of a capability, from the web process", () => {
  it("resolves a Stripe PaymentIntent, a printed token and a device token to their business", async () => {
    const { marea, cala, mareaOrder, calaOrder } = await twoBusinessesWithOrders();
    await owner.payment.create({
      data: { businessId: cala.id, orderId: calaOrder.id, provider: "STRIPE", status: "PENDING", amount: "10.00", stripePaymentIntentId: "pi_cala" },
    });
    await owner.device.create({
      data: { businessId: marea.id, name: "Kitchen", kind: "PRINTER", tokenHash: "hash-marea" } as never,
    });

    // The Stripe webhook runs in the web process with no host and no session:
    // all it has is the PaymentIntent the signed event names.
    expect(await businessIdForPaymentIntent("pi_cala")).toBe(cala.id);
    expect(await businessIdForPaymentIntent("pi_unknown")).toBeNull();
    expect(await businessIdForToken("order", mareaOrder.publicToken)).toBe(marea.id);
    expect(await businessIdForDeviceTokenHash("hash-marea")).toBe(marea.id);
  });
});

describe("the worker role", () => {
  it("claims notification jobs across businesses", async () => {
    const { marea, cala } = await twoBusinessesWithOrders();
    await owner.notificationJob.createMany({
      data: [
        { businessId: marea.id, channel: "EMAIL", templateKey: "order.ready", recipientEmail: "a@example.com" },
        { businessId: cala.id, channel: "EMAIL", templateKey: "order.ready", recipientEmail: "b@example.com" },
      ],
    });
    const worker = workerClient();

    const jobs = await worker.notificationJob.findMany({ select: { businessId: true } });
    expect(jobs.map((j) => j.businessId).sort()).toEqual([cala.id, marea.id].sort());
    expect((await worker.notificationJob.updateMany({ data: { status: "PROCESSING" } })).count).toBe(2);
  });

  it("can discover which business a token belongs to, and nothing more about the row", async () => {
    const { calaOrder } = await twoBusinessesWithOrders();
    const worker = workerClient();

    const found = await worker.order.findUnique({
      where: { publicToken: calaOrder.publicToken },
      select: { businessId: true },
    });
    expect(found?.businessId).toBe(calaOrder.businessId);
    // A full row is refused: the role holds column grants, not the table.
    await expect(worker.order.findUnique({ where: { id: calaOrder.id } })).rejects.toThrow(/permission denied/);
  });

  it("cannot read a menu, a customer's data or any table it was not given", async () => {
    const { marea } = await twoBusinessesWithOrders();
    const category = await makeMenuCategory(marea.id);
    await makeMenuItem(marea.id, category.id);
    const worker = workerClient();

    await expect(worker.menuItem.findMany()).rejects.toThrow(/permission denied/);
    await expect(worker.reservation.findMany()).rejects.toThrow(/permission denied/);
    await expect(worker.payment.findMany()).rejects.toThrow(/permission denied/);
    await expect(worker.orderItem.findMany()).rejects.toThrow(/permission denied/);
  });
});

describe("findRoleProblem", () => {
  it("accepts the application role and flags the table owner", async () => {
    await makeBusiness({ slug: "marea" });
    expect(await findRoleProblem(appClient())).toBeNull();
    expect(await findRoleProblem(workerClient())).toBeNull();
    // The harness connects as whoever ran the migrations, which owns the tables.
    expect(await findRoleProblem(owner)).toMatch(/superuser|owns the tables/);
  });
});
