-- Review of module 19, phases 2 to 4: the cleanup of an unverified signup no
-- longer trusts its caller. Hand-written, like the migrations it replaces
-- parts of (20261003000000_add_signup_cleanup).
--
-- 1. marea_purge_unverified_signup(organization_id) takes ONLY the
--    organization. It used to take a user id too and deleted whatever user it
--    was handed, and anyone can create an unverified organization by signing
--    up: that was a way to delete an arbitrary account. The users to delete
--    are now derived here, and a user is deleted only when nothing outside
--    this organization depends on them: no membership at a business of
--    another organization (or of none), not a SUPER_ADMIN, not the ORG_ADMIN
--    of something else. Same principle as marea_signup: the database does not
--    trust who calls it.
--
-- 2. marea_unverified_signups(cutoff) no longer goes through
--    EmailVerificationToken. An organization whose process died between
--    marea_signup() and the transaction that creates the user and the token
--    has no token, was skipped by the old join, and kept its slug forever.
--    Every unverified organization older than the cutoff is a candidate now;
--    the purge re-checks verifiedAt itself.
--
-- 3. Backfill, which makes (2) safe. Organization.verifiedAt was added null
--    for everything that existed, but only marea_signup()'s organizations are
--    meant to start unverified. Without it, listing "every unverified
--    organization" would list (and purge) every chain an operator onboarded
--    before module 19 — and lib/business.ts would be hiding their businesses
--    from the public. Verified here: every organization that has no
--    verification token, i.e. that no signup is waiting on.
--
-- A user who cannot be deleted (it is referenced by something Restrict, say a
-- guest who ordered under the same email) is skipped inside a subtransaction
-- instead of failing the whole purge; the next run tries again.
--
-- Revert with: DROP FUNCTION marea_purge_unverified_signup(text);
-- DROP FUNCTION marea_unverified_signups(timestamp), then recreate both from
-- 20261003000000_add_signup_cleanup. The backfill is not undone.

UPDATE "Organization" o SET "verifiedAt" = now() AT TIME ZONE 'UTC'
WHERE o."verifiedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "EmailVerificationToken" t WHERE t."organizationId" = o.id);

DROP FUNCTION marea_purge_unverified_signup(text, text);
DROP FUNCTION marea_unverified_signups(timestamp);

CREATE FUNCTION marea_purge_unverified_signup(organization_id text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS
$$
DECLARE
  doomed text[];
  candidate text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id = organization_id AND "verifiedAt" IS NULL) THEN
    RETURN false;
  END IF;

  -- Derived before the business goes: its memberships cascade with it.
  SELECT coalesce(array_agg(DISTINCT u.id), '{}') INTO doomed
  FROM "User" u
  WHERE (
      EXISTS (
        SELECT 1 FROM "BusinessMembership" m JOIN "Business" b ON b.id = m."businessId"
        WHERE m."userId" = u.id AND b."organizationId" = organization_id
      )
      OR EXISTS (SELECT 1 FROM "EmailVerificationToken" t WHERE t."userId" = u.id AND t."organizationId" = organization_id)
      OR u."organizationId" = organization_id
    )
    AND u.role <> 'SUPER_ADMIN'
    AND (u.role <> 'ORG_ADMIN' OR u."organizationId" = organization_id)
    AND NOT EXISTS (
      SELECT 1 FROM "BusinessMembership" m JOIN "Business" b ON b.id = m."businessId"
      WHERE m."userId" = u.id AND b."organizationId" IS DISTINCT FROM organization_id
    );

  DELETE FROM "Business" WHERE "organizationId" = organization_id;

  FOREACH candidate IN ARRAY doomed LOOP
    BEGIN
      DELETE FROM "User" WHERE id = candidate;
    EXCEPTION WHEN foreign_key_violation THEN
      NULL;
    END;
  END LOOP;

  BEGIN
    DELETE FROM "Organization" WHERE id = organization_id;
  EXCEPTION WHEN foreign_key_violation OR check_violation THEN
    RETURN false;
  END;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION marea_purge_unverified_signup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marea_purge_unverified_signup(text) TO marea_app;

CREATE FUNCTION marea_unverified_signups(cutoff timestamp) RETURNS TABLE (organization_id text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS
$$
  SELECT o.id FROM "Organization" o WHERE o."verifiedAt" IS NULL AND o."createdAt" < cutoff
$$;

REVOKE ALL ON FUNCTION marea_unverified_signups(timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marea_unverified_signups(timestamp) TO marea_app;
