/**
 * Singleton Prisma client for the app (Next.js).
 *
 * Prisma 7 no longer accepts a direct URL in `new PrismaClient()`: it needs
 * a "driver adapter" (here @prisma/adapter-pg, for Postgres directly, no
 * pooler in between) passed to it. DATABASE_URL is validated at boot in
 * lib/env.ts, not here.
 *
 * The globalForPrisma pattern avoids creating a new PrismaClient on every
 * `next dev` hot-reload, which left unchecked exhausts connections in
 * seconds.
 *
 * Built lazily, on first real use — not at import. This module is imported
 * from almost everywhere, and creating it at import time would reopen
 * exactly the cold-build risk lib/env.ts already avoids (Next inspects
 * route modules during `next build`).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg(
    {
      connectionString: env.DATABASE_URL,
      // Outside serverless the app is a long-lived process with its own pool
      // — see the DATABASE_POOL_MAX comment in lib/env.ts for the formula.
      max: env.DATABASE_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    },
    env.DATABASE_SCHEMA ? { schema: env.DATABASE_SCHEMA } : undefined
  );
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client as object, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
