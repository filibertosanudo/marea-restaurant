/**
 * Cliente Prisma singleton para la app (Next.js).
 *
 * Prisma 7 ya no acepta una URL directa en `new PrismaClient()`: hay que
 * construir un "driver adapter" (aquí @prisma/adapter-pg para Postgres
 * directo, sin pooler intermedio) y pasárselo. DATABASE_URL se valida al
 * arrancar en lib/env.ts, no aquí.
 *
 * El patrón globalForPrisma evita crear un PrismaClient nuevo en cada
 * hot-reload de `next dev`, que si no se controla acaba agotando las
 * conexiones en segundos.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    // Fuera de serverless la app es un proceso largo con su propio pool —
    // ver el comentario de DATABASE_POOL_MAX en lib/env.ts para la fórmula.
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
