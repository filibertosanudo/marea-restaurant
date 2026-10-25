-- The platform's own subscription, one per organization (module 19, phase 6).
-- Hand-written, like the other module 19 migrations.
--
-- Scoped like Organization itself: marea_app sees and writes the row of the
-- organization its current business belongs to, through the same
-- marea_business_org() lookup as Organization's own tenant_isolation policy.
-- No DELETE: a subscription row goes away with its organization (cascade,
-- which runs as the owner inside marea_purge_unverified_signup), never on its
-- own from the application.
--
-- marea_worker reads the row's id and the ids a signed Stripe event carries,
-- to find which organization the event is about (lib/tenancy/discover.ts),
-- and nothing about its state.
--
-- Revert with: DROP TABLE "OrganizationSubscription"; DROP TYPE "SubscriptionStatus".

CREATE TYPE "SubscriptionStatus" AS ENUM ('NOT_STARTED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'PAUSED', 'CANCELED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED');

CREATE TABLE "OrganizationSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stripeCustomerAccountId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "planLookupKey" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "hasPaymentMethod" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationSubscription_organizationId_key" ON "OrganizationSubscription"("organizationId");
CREATE UNIQUE INDEX "OrganizationSubscription_stripeCustomerAccountId_key" ON "OrganizationSubscription"("stripeCustomerAccountId");
CREATE UNIQUE INDEX "OrganizationSubscription_stripeSubscriptionId_key" ON "OrganizationSubscription"("stripeSubscriptionId");

ALTER TABLE "OrganizationSubscription" ADD CONSTRAINT "OrganizationSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationSubscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrganizationSubscription" TO marea_app
  USING ("organizationId" IN (SELECT organization_id FROM marea_business_org(current_setting('app.business_id', true))));

REVOKE DELETE ON "OrganizationSubscription" FROM marea_app;
GRANT SELECT ("id", "organizationId", "stripeCustomerAccountId", "stripeSubscriptionId") ON "OrganizationSubscription" TO marea_worker;
CREATE POLICY worker_read ON "OrganizationSubscription" FOR SELECT TO marea_worker USING (true);
