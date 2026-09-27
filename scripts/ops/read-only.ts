/**
 * Turns the deployment-wide read-only mode on or off — a command, never a
 * deploy. Connects as the app's own role (marea_app), the same DATABASE_URL
 * as the running app: this is what it reads, cached a few seconds
 * (lib/ops/read-only.ts).
 *
 *   npm run ops:read-only -- status
 *   npm run ops:read-only -- on --reason "migrating the promotions table"
 *   npm run ops:read-only -- off
 */
import "dotenv/config";
import { prisma } from "../../lib/prisma";

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const command = process.argv[2];

  if (command === "status") {
    const row = await prisma.readOnlyMode.findFirst({ where: { scope: "PLATFORM" } });
    console.log(row ? `ON since ${row.enabledAt.toISOString()}${row.reason ? ` — ${row.reason}` : ""}` : "OFF");
    return;
  }

  if (command === "on") {
    const reason = flagValue("--reason") ?? null;
    const enabledBy = process.env.USER ?? process.env.USERNAME ?? null;
    // Not upsert(): Postgres never matches an existing row through a
    // compound unique key whose column is NULL (organizationId, here) — an
    // upsert keyed on it would insert a second row instead of updating the
    // first, and only the partial index (not this typed key) would catch
    // it, as a raw constraint violation instead of a graceful update.
    const existing = await prisma.readOnlyMode.findFirst({ where: { scope: "PLATFORM" } });
    if (existing) {
      await prisma.readOnlyMode.update({ where: { id: existing.id }, data: { reason, enabledAt: new Date(), enabledBy } });
    } else {
      await prisma.readOnlyMode.create({ data: { scope: "PLATFORM", reason, enabledBy } });
    }
    console.log(`Read-only mode is ON${reason ? `: ${reason}` : ""}. Takes effect within a few seconds everywhere (the cache in lib/ops/read-only.ts).`);
    return;
  }

  if (command === "off") {
    await prisma.readOnlyMode.deleteMany({ where: { scope: "PLATFORM" } });
    console.log("Read-only mode is OFF. Takes effect within a few seconds everywhere.");
    return;
  }

  console.error('Usage: npm run ops:read-only -- <status|on|off> [--reason "..."]');
  process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
