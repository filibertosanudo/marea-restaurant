/**
 * Prints one active table's { id, code, qrToken } as JSON on stdout.
 *
 * Run via `tsx` (already a devDependency — the exact tool prisma/seed.ts
 * itself runs under) as a child process from checkout-flow.spec.ts, not
 * imported directly: lib/generated/prisma/client.ts is ESM-only (reads
 * import.meta.url), and Playwright Test's own TS transform compiles test
 * files to CommonJS. tsx's loader handles that file correctly — its own
 * process just isn't the one Playwright launches the test in.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../lib/generated/prisma/client";

async function main() {
  const connectionString =
    process.env.E2E_DATABASE_URL ?? "postgresql://marea:marea@localhost:5434/marea";
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const table = await db.restaurantTable.findFirstOrThrow({
      where: { business: { slug: "marea" }, isActive: true },
      select: { id: true, code: true, qrToken: true },
    });
    process.stdout.write(JSON.stringify(table));
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
