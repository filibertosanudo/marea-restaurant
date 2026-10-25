-- When an organization stopped paying (module 19, phase 8). Hand-written, a
-- plain column: the policies and grants of the subscription table already
-- cover it, and marea_worker's column grant does not include it on purpose.
--
-- Revert with: ALTER TABLE "OrganizationSubscription" DROP COLUMN "lapsedSince";

ALTER TABLE "OrganizationSubscription" ADD COLUMN "lapsedSince" TIMESTAMP(3);
