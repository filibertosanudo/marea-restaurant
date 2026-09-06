-- AlterTable: add nullable first so existing rows can be backfilled before
-- the NOT NULL + UNIQUE constraints land — a plain ADD COLUMN NOT NULL
-- would have nothing to put in existing rows, since cuid(2) is a
-- Prisma-client default, not a database one.
ALTER TABLE "NewsletterSubscriber" ADD COLUMN "unsubscribeToken" TEXT;

-- Backfill: same encoding shape as elsewhere in this migration set
-- (RateLimitCounter's data move) — not a real cuid(2), just unguessable,
-- which is all this token needs to be. New rows get a real cuid(2) from
-- Prisma going forward.
UPDATE "NewsletterSubscriber" SET "unsubscribeToken" = md5(id || clock_timestamp()::text)
WHERE "unsubscribeToken" IS NULL;

ALTER TABLE "NewsletterSubscriber" ALTER COLUMN "unsubscribeToken" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_unsubscribeToken_key" ON "NewsletterSubscriber"("unsubscribeToken");
