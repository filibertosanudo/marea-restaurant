/**
 * Prints, as JSON on stdout, the public tokens of the seeded orders of both
 * businesses (marea and cala), so a spec can try one business's token on the
 * other's host. Run through tsx as a child process, for the same reason as
 * get-first-table.ts.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../lib/generated/prisma/client";

async function main() {
  const connectionString = process.env.E2E_DATABASE_URL ?? "postgresql://marea:marea@localhost:5434/marea";
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const orderToken = async (slug: string) =>
      (
        await db.order.findFirstOrThrow({
          where: { business: { slug }, orderNumber: "A-0001" },
          select: { publicToken: true },
        })
      ).publicToken;
    process.stdout.write(JSON.stringify({ marea: await orderToken("marea"), cala: await orderToken("cala") }));
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
