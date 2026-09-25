-- Row level security (module 17, phase 3). Hand-written, like the reservation
-- EXCLUDE constraint and the realtime triggers: Prisma cannot express any of it.
--
-- WHAT THIS IS. A safety net under the "where: { businessId }" that every query
-- already carries. If a query ever forgets it, or filters by the wrong business,
-- Postgres returns nothing (or refuses the write) instead of another business's
-- rows. It is defence in depth, not a replacement for the filter.
--
-- HOW IT WORKS. Every business table gets one policy comparing its "businessId"
-- to the setting app.business_id. The application stamps that setting onto each
-- pooled connection as it hands it out (lib/db/tenant-pool.ts). No setting means
-- the empty string, which matches no row. Tables that have no "businessId" of
-- their own (OrderItem, Refund, translations...) inherit through their parent:
-- the EXISTS subquery is itself filtered by the parent's policy.
--
-- WHO IS SUBJECT TO IT. Row level security does not apply to a table's owner or
-- to a superuser, so it does nothing for a connection made as the role that ran
-- the migrations. The application must connect as marea_app. Two roles:
--
--   marea_app     the web application. Full DML on every table, subject to the
--                 policies. Cannot change the schema.
--   marea_worker  the notification queue, the realtime recovery sweep and the
--                 lookups that find which business a capability (device token,
--                 Stripe event, printed token) belongs to. It has no policy on
--                 most tables and column-level grants on the rest, so it can
--                 read ids and business ids and nothing a customer would call
--                 data. It does not get BYPASSRLS.
--
-- The roles are created NOLOGIN so no password lives in a migration. A
-- deployment gives them one (docs/DEPLOY.md). Migrations, the seed and
-- maintenance run as the owner.
--
-- NOT COVERED, ON PURPOSE. Identity tables (User, Account, Session,
-- VerificationToken, LoginAttempt, RateLimitCounter, PasswordResetToken,
-- MembershipEvent, BusinessMembership) are keyed by user, not by business: a
-- login must find a user's memberships in every business. StripeWebhookEvent is
-- platform-level. Business is readable by everyone (it is the public site) and
-- writable only for its own row.
--
-- Revert with: ALTER TABLE ... DISABLE ROW LEVEL SECURITY on each table below
-- and DROP POLICY IF EXISTS on each policy; the roles can stay.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'marea_app') THEN
    CREATE ROLE marea_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'marea_worker') THEN
    CREATE ROLE marea_worker NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

-- Privileges on the schema this migration runs in (public in production, a
-- throwaway schema in the integration tests), including what is created later.
DO $$
DECLARE
  s text := current_schema();
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO marea_app, marea_worker', s);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO marea_app', s);
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO marea_app', s);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO marea_app', s);
  EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO marea_app', s);
  EXECUTE format('REVOKE ALL ON %I."_prisma_migrations" FROM marea_app', s);
END
$$;

-- ---------------------------------------------------------------------------
-- Tables with their own "businessId"
-- ---------------------------------------------------------------------------

ALTER TABLE "BusinessTranslation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BusinessTranslation" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "OpeningHour" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OpeningHour" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "BusinessClosure" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BusinessClosure" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "MenuCategory" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MenuCategory" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "MenuItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MenuItem" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "Tag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Tag" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "ModifierGroup" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ModifierGroup" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "RestaurantTable" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "RestaurantTable" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "Cart" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Cart" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "OrderCounter" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrderCounter" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "Payment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Payment" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "CashSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashSession" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "Reservation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Reservation" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "Promotion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Promotion" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "Testimonial" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Testimonial" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "NotificationJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NotificationJob" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "Device" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Device" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "PrintJob" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PrintJob" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

ALTER TABLE "NewsletterSubscriber" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "NewsletterSubscriber" TO marea_app
  USING ("businessId" = current_setting('app.business_id', true));

-- ---------------------------------------------------------------------------
-- Tables that inherit their business from a parent row
-- ---------------------------------------------------------------------------

ALTER TABLE "MenuCategoryTranslation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MenuCategoryTranslation" TO marea_app
  USING (EXISTS (SELECT 1 FROM "MenuCategory" parent WHERE parent.id = "MenuCategoryTranslation"."categoryId"));

ALTER TABLE "MenuItemTranslation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MenuItemTranslation" TO marea_app
  USING (EXISTS (SELECT 1 FROM "MenuItem" parent WHERE parent.id = "MenuItemTranslation"."menuItemId"));

ALTER TABLE "TagTranslation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TagTranslation" TO marea_app
  USING (EXISTS (SELECT 1 FROM "Tag" parent WHERE parent.id = "TagTranslation"."tagId"));

ALTER TABLE "MenuItemTag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MenuItemTag" TO marea_app
  USING (EXISTS (SELECT 1 FROM "MenuItem" parent WHERE parent.id = "MenuItemTag"."menuItemId"));

ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StockMovement" TO marea_app
  USING (EXISTS (SELECT 1 FROM "MenuItem" parent WHERE parent.id = "StockMovement"."menuItemId"));

ALTER TABLE "ModifierGroupTranslation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ModifierGroupTranslation" TO marea_app
  USING (EXISTS (SELECT 1 FROM "ModifierGroup" parent WHERE parent.id = "ModifierGroupTranslation"."groupId"));

ALTER TABLE "ModifierOption" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ModifierOption" TO marea_app
  USING (EXISTS (SELECT 1 FROM "ModifierGroup" parent WHERE parent.id = "ModifierOption"."groupId"));

ALTER TABLE "ModifierOptionTranslation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ModifierOptionTranslation" TO marea_app
  USING (EXISTS (SELECT 1 FROM "ModifierOption" parent WHERE parent.id = "ModifierOptionTranslation"."optionId"));

ALTER TABLE "MenuItemModifierGroup" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MenuItemModifierGroup" TO marea_app
  USING (EXISTS (SELECT 1 FROM "MenuItem" parent WHERE parent.id = "MenuItemModifierGroup"."menuItemId"));

ALTER TABLE "CartItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CartItem" TO marea_app
  USING (EXISTS (SELECT 1 FROM "Cart" parent WHERE parent.id = "CartItem"."cartId"));

ALTER TABLE "CartItemModifier" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CartItemModifier" TO marea_app
  USING (EXISTS (SELECT 1 FROM "CartItem" parent WHERE parent.id = "CartItemModifier"."cartItemId"));

ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrderItem" TO marea_app
  USING (EXISTS (SELECT 1 FROM "Order" parent WHERE parent.id = "OrderItem"."orderId"));

ALTER TABLE "OrderItemModifier" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrderItemModifier" TO marea_app
  USING (EXISTS (SELECT 1 FROM "OrderItem" parent WHERE parent.id = "OrderItemModifier"."orderItemId"));

ALTER TABLE "OrderStatusEvent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrderStatusEvent" TO marea_app
  USING (EXISTS (SELECT 1 FROM "Order" parent WHERE parent.id = "OrderStatusEvent"."orderId"));

ALTER TABLE "Refund" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Refund" TO marea_app
  USING (EXISTS (SELECT 1 FROM "Payment" parent WHERE parent.id = "Refund"."paymentId"));

ALTER TABLE "CashMovement" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "CashMovement" TO marea_app
  USING (EXISTS (SELECT 1 FROM "CashSession" parent WHERE parent.id = "CashMovement"."cashSessionId"));

ALTER TABLE "PromotionTranslation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PromotionTranslation" TO marea_app
  USING (EXISTS (SELECT 1 FROM "Promotion" parent WHERE parent.id = "PromotionTranslation"."promotionId"));

ALTER TABLE "PromotionMenuItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PromotionMenuItem" TO marea_app
  USING (EXISTS (SELECT 1 FROM "Promotion" parent WHERE parent.id = "PromotionMenuItem"."promotionId"));

ALTER TABLE "OrderPromotion" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrderPromotion" TO marea_app
  USING (EXISTS (SELECT 1 FROM "Order" parent WHERE parent.id = "OrderPromotion"."orderId"));

ALTER TABLE "TestimonialTranslation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "TestimonialTranslation" TO marea_app
  USING (EXISTS (SELECT 1 FROM "Testimonial" parent WHERE parent.id = "TestimonialTranslation"."testimonialId"));

-- ---------------------------------------------------------------------------
-- Business: public to read, writable only for the caller's own row. No INSERT
-- or DELETE policy, so the application cannot create or remove a business.
-- ---------------------------------------------------------------------------
ALTER TABLE "Business" ENABLE ROW LEVEL SECURITY;
CREATE POLICY business_read ON "Business" FOR SELECT TO marea_app USING (true);
CREATE POLICY business_update ON "Business" FOR UPDATE TO marea_app
  USING (id = current_setting('app.business_id', true))
  WITH CHECK (id = current_setting('app.business_id', true));

-- ---------------------------------------------------------------------------
-- marea_worker. Reads and updates the notification queue, reads Business, and
-- gets column-level SELECT on the rest: enough to sweep for changes and to
-- discover which business a token belongs to, never a row's contents.
-- ---------------------------------------------------------------------------
GRANT SELECT ON "Business" TO marea_worker;
CREATE POLICY worker_read ON "Business" FOR SELECT TO marea_worker USING (true);

GRANT SELECT, UPDATE ON "NotificationJob" TO marea_worker;
CREATE POLICY worker_all ON "NotificationJob" TO marea_worker USING (true) WITH CHECK (true);

-- Realtime recovery sweep.
GRANT SELECT ("orderId", "createdAt") ON "OrderStatusEvent" TO marea_worker;
CREATE POLICY worker_read ON "OrderStatusEvent" FOR SELECT TO marea_worker USING (true);
GRANT SELECT ("cashSessionId", "createdAt") ON "CashMovement" TO marea_worker;
CREATE POLICY worker_read ON "CashMovement" FOR SELECT TO marea_worker USING (true);
GRANT SELECT ("id", "businessId", "openedAt", "closedAt") ON "CashSession" TO marea_worker;
CREATE POLICY worker_read ON "CashSession" FOR SELECT TO marea_worker USING (true);

-- Sweep plus tenant discovery: a Stripe event carries a PaymentIntent id, a
-- printed link carries a token, an agent carries a device token.
GRANT SELECT ("id", "businessId", "orderId", "updatedAt", "stripePaymentIntentId") ON "Payment" TO marea_worker;
CREATE POLICY worker_read ON "Payment" FOR SELECT TO marea_worker USING (true);
GRANT SELECT ("id", "businessId", "publicToken") ON "Order" TO marea_worker;
CREATE POLICY worker_read ON "Order" FOR SELECT TO marea_worker USING (true);
GRANT SELECT ("id", "businessId", "qrToken") ON "RestaurantTable" TO marea_worker;
CREATE POLICY worker_read ON "RestaurantTable" FOR SELECT TO marea_worker USING (true);
GRANT SELECT ("id", "businessId", "confirmationCode") ON "Reservation" TO marea_worker;
CREATE POLICY worker_read ON "Reservation" FOR SELECT TO marea_worker USING (true);
GRANT SELECT ("id", "businessId", "tokenHash") ON "Device" TO marea_worker;
CREATE POLICY worker_read ON "Device" FOR SELECT TO marea_worker USING (true);
