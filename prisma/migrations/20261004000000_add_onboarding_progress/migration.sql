-- The wizard's own progress (module 19, phase 4). Hand-written for the same
-- reason as every other module 19 migration (this project's shadow database
-- cannot replay enable_row_level_security), though this one's shape is a
-- plain Prisma diff otherwise: no new grant, no SECURITY DEFINER function —
-- marea_app already has ordinary UPDATE on its own Business row
-- (business_update, from enable_row_level_security).
--
-- Backfilled, not left null: every Business this migration finds already
-- existing was provisioned by a human (scripts/tenants.ts, or a deployment
-- from before this column existed) — nobody is waiting on a four-step
-- wizard for those, so they start already complete, same "no existing
-- business changes behavior" rule the minBookingLeadMinutes/
-- minCancelLeadMinutes migration used. Only a fresh marea_signup() (the
-- ALTER TABLE's own default) starts the wizard.
--
-- Revert with: ALTER TABLE "Business" DROP COLUMN "onboardingStep",
-- DROP COLUMN "onboardingCompletedAt";

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "onboardingStep" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Business" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill: every business that already exists is grandfathered in as done.
UPDATE "Business" SET "onboardingCompletedAt" = now(), "onboardingStep" = 4 WHERE "onboardingCompletedAt" IS NULL;
