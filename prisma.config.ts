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
    // DIRECT_URL is only needed if a transaction-mode pooler sits in front
    // of the app (it doesn't support Migrate's prepared statements). With
    // Postgres directly, DATABASE_URL is enough for everything.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
