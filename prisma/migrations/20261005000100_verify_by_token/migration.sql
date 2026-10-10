-- Review of module 19, phases 2 to 4: verification takes the token, not the
-- organization. Hand-written, replacing marea_verify_organization from
-- 20261002000000_add_email_verification.
--
-- The old function took an organization id and stamped it verified: a door in
-- the database that verified any organization to whoever could call it as
-- marea_app, with the token check living only in TypeScript. This one takes
-- the sha256 of the emailed token, finds it, requires it unused and unexpired,
-- marks it used, stamps the user's email and the organization as verified and
-- returns their ids, all in one statement-level transaction. There is no way
-- to verify an organization here without holding its token.
--
-- The claim is one UPDATE ... WHERE usedAt IS NULL ... RETURNING, so two
-- requests with the same token cannot both succeed. Open tokens of the same
-- user are closed too, as resetPasswordAction does for resets.
--
-- Timestamps are written as UTC explicitly: the columns are timestamp(3)
-- without time zone and Prisma stores UTC in them, while now() would be
-- converted with whatever TimeZone the session has.
--
-- Revert with: DROP FUNCTION marea_verify_organization(text), then recreate it
-- from 20261002000000_add_email_verification.

DROP FUNCTION marea_verify_organization(text);

CREATE FUNCTION marea_verify_organization(token_hash text) RETURNS TABLE (user_id text, organization_id text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS
$$
DECLARE
  utc_now timestamp := now() AT TIME ZONE 'UTC';
  claimed_user text;
  claimed_org text;
BEGIN
  UPDATE "EmailVerificationToken" SET "usedAt" = utc_now
  WHERE "tokenHash" = token_hash AND "usedAt" IS NULL AND "expiresAt" > utc_now
  RETURNING "userId", "organizationId" INTO claimed_user, claimed_org;

  IF claimed_org IS NULL THEN
    RETURN;
  END IF;

  UPDATE "User" SET "emailVerified" = utc_now WHERE id = claimed_user;
  UPDATE "Organization" SET "verifiedAt" = utc_now WHERE id = claimed_org AND "verifiedAt" IS NULL;
  UPDATE "EmailVerificationToken" SET "usedAt" = utc_now WHERE "userId" = claimed_user AND "usedAt" IS NULL;

  RETURN QUERY SELECT claimed_user, claimed_org;
END;
$$;

REVOKE ALL ON FUNCTION marea_verify_organization(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marea_verify_organization(text) TO marea_app;
