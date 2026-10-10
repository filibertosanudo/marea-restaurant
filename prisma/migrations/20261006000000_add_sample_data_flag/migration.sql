-- Sample data the wizard can offer and later delete (module 19, phase 5).
-- Hand-written, same reason as the other module 19 migrations: a plain column
-- each, no new grant, no function.
--
-- isSample marks a row the platform inserted so a new owner sees a full
-- system; it is cleared the moment the owner does anything to that specific
-- row (lib/onboarding/sample-adoption.ts) and it is the only thing "delete
-- sample data" is allowed to select on. false for everything that exists.
--
-- Revert with: ALTER TABLE ... DROP COLUMN "isSample" on each of the three.

ALTER TABLE "MenuCategory" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MenuItem" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RestaurantTable" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
