-- The guards around the Stripe Connect columns (module 17b, phase 2).
-- Hand-written: Prisma cannot express a trigger, a CHECK or a column grant.
--
-- 1. Payment."stripeAccountId" is written once, at INSERT, and never after.
--    NULL means the platform's own Stripe account, where every payment made
--    before Connect lives. A refund or a lookup goes to the account THIS ROW
--    names, not to the one the business has today, so a row that could be
--    re-labelled later would send its refund to an account where the intent
--    does not exist. The trigger rejects any change, including NULL to a
--    value: protecting only "once set" would let an old platform payment be
--    re-labelled with a connected account. (The owner can still disable the
--    trigger; the application role cannot.)
--
-- 2. Business.country is an ISO 3166-1 alpha-2 code in capitals. Nobody writes
--    it yet and the public site only reads it (structured data). Onboarding
--    a connected account needs it, so the shape is fixed before anything does.
--
-- 3. The system role (marea_worker, see the row level security migration) may
--    read the two columns a Stripe event is matched by, and nothing else new:
--    which business does this connected account belong to, and which account
--    does this payment live in. Without these grants the webhook would fail in
--    production and not in a test that runs as the owner.
--
-- Revert with: DROP TRIGGER payment_stripe_account_immutable ON "Payment";
-- DROP FUNCTION marea_payment_account_immutable();
-- ALTER TABLE "Business" DROP CONSTRAINT business_country_iso;
-- REVOKE SELECT ("stripeAccountId") ON "Payment", "Business" FROM marea_worker;

CREATE FUNCTION marea_payment_account_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."stripeAccountId" IS DISTINCT FROM OLD."stripeAccountId" THEN
    RAISE EXCEPTION 'Payment.stripeAccountId cannot change after the row is created (payment %)', OLD.id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_stripe_account_immutable
  BEFORE UPDATE OF "stripeAccountId" ON "Payment"
  FOR EACH ROW EXECUTE FUNCTION marea_payment_account_immutable();

ALTER TABLE "Business" ADD CONSTRAINT business_country_iso
  CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');

GRANT SELECT ("stripeAccountId") ON "Payment" TO marea_worker;
GRANT SELECT ("stripeAccountId") ON "Business" TO marea_worker;
