/**
 * Prints, as JSON on stdout, the verification link the signup just queued for
 * an email address: the e2e stack runs no mail worker, and the link is the
 * one thing the spec cannot learn from the page. The token itself is stored
 * only as a hash; the link lives in the queued job's payload, as the email
 * template would read it. Run through tsx as a child process, for the same
 * reason as get-first-table.ts.
 *
 *   npx tsx e2e/scripts/get-verify-url.ts owner@example.test
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../lib/generated/prisma/client";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Pass the signup's email address.");
  const connectionString = process.env.E2E_DATABASE_URL ?? "postgresql://marea:marea@localhost:5434/marea";
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const job = await db.notificationJob.findFirstOrThrow({
      where: { templateKey: "signup.verify", recipientEmail: email },
      orderBy: { createdAt: "desc" },
      select: { payload: true },
    });
    const { verifyUrl } = job.payload as { verifyUrl: string };
    process.stdout.write(JSON.stringify({ verifyUrl }));
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
