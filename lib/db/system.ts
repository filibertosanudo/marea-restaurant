import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { env } from "@/lib/env";

/**
 * The client for work that has no business: the notification queue, the
 * realtime sweep, and the narrow lookups that discover which business a
 * capability (a device token, a Stripe event, a printed QR token) belongs to.
 *
 * It connects as `marea_worker`, a role with a policy on exactly the tables
 * that work needs and column-level grants on the rest (prisma/migrations/
 * *_enable_row_level_security). It is not a way around the isolation: it
 * cannot read an order's contents, a menu or a customer. Anything that then
 * needs a business's data goes back through `prisma` inside runInTenant().
 */
const globalForSystem = globalThis as unknown as { systemPrisma?: PrismaClient };

function createSystemClient(): PrismaClient {
  const pool = new pg.Pool({
    connectionString: env.WORKER_DATABASE_URL ?? env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({
    adapter: new PrismaPg(pool, env.DATABASE_SCHEMA ? { schema: env.DATABASE_SCHEMA } : undefined),
  });
}

export const systemPrisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    globalForSystem.systemPrisma ??= createSystemClient();
    const client = globalForSystem.systemPrisma;
    const value = Reflect.get(client as object, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
