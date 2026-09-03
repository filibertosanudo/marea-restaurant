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
 *
 * Construido perezosamente, en el primer uso real — no al importar. Este
 * módulo se importa desde casi todas partes, y crearlo al importar volvería
 * a exponer al arranque en frío del build (Next inspecciona los módulos de
 * ruta durante `next build`) exactamente el riesgo que lib/env.ts ya evita.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
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
