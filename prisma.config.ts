/**
 * Prisma 7 movió la configuración fuera de schema.prisma.
 * Aquí viven la URL de migraciones y el comando de seed.
 *
 * Si te quedas en Prisma 6: borra este archivo, regresa `url`/`directUrl`
 * al bloque `datasource` del schema y declara el seed en package.json:
 *   "prisma": { "seed": "tsx prisma/seed.ts" }
 */
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    path: "prisma/migrations",
    // Supabase: usa la conexión DIRECTA (:5432), no el pooler,
    // porque pgbouncer no soporta los prepared statements de Migrate.
    seed: "tsx prisma/seed.ts",
  },

  datasource: {
    url: env("DIRECT_URL"),
  },
});
