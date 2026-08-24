/**
 * Cliente Prisma singleton para la app (Next.js).
 *
 * Prisma 7 ya no acepta una URL directa en `new PrismaClient()`: hay que
 * construir un "driver adapter" (aquí @prisma/adapter-pg para Postgres) y
 * pasárselo. DATABASE_URL debe ser la conexión con pooler (pgbouncer,
 * puerto 6543 en Supabase) porque es la que usa la app en runtime — la
 * conexión directa (DIRECT_URL, puerto 5432) es solo para `prisma migrate`
 * y vive en prisma.config.ts, no aquí.
 *
 * El patrón globalForPrisma evita crear un PrismaClient nuevo en cada
 * hot-reload de `next dev`, que si no se controla acaba agotando las
 * conexiones del pooler en segundos.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL no está definida. Revisa tu .env (usa la URL del pooler de Supabase, puerto 6543)."
    );
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
