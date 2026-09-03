/**
 * Prisma 7 movió la configuración fuera de schema.prisma.
 * Aquí viven la URL de migraciones y el comando de seed.
 *
 * Si te quedas en Prisma 6: borra este archivo, regresa `url`/`directUrl`
 * al bloque `datasource` del schema y declara el seed en package.json:
 *   "prisma": { "seed": "tsx prisma/seed.ts" }
 */
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },

  datasource: {
    // DIRECT_URL sólo hace falta si un pooler en modo transacción vive
    // delante de la app (no soporta los prepared statements de Migrate).
    // Con Postgres directo, DATABASE_URL sirve para todo.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
