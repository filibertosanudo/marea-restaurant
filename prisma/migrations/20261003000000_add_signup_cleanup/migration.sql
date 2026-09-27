-- Cleanup for a signup nobody verified (module 19, phase 3). Hand-written,
-- same reasoning as the two other module 19 migrations.
--
-- WHY A HARD DELETE. Every other place this schema removes a Business sets
-- deletedAt (marea_app has no DELETE policy on it, and Business.slug's
-- unique index is not partial — a soft-deleted row still holds its slug
-- forever). That is fine for a real business leaving; it is exactly wrong
-- here; the entire point of this cleanup is freeing the slug so the real
-- restaurant can use it. A hard delete is safe only because nothing of
-- consequence can exist yet: lib/business.ts refuses to publish an
-- unverified organization's business at all, so no guest ever reached its
-- storefront, placed an order or made a reservation — whatever the wizard
-- built (menu, tables, hours) cascades away with it (every direct child of
-- Business uses onDelete: Cascade; confirmed by reading the schema, not
-- assumed).
--
-- WHAT THE FUNCTION WILL NOT DO. Re-checks "verifiedAt IS NULL" itself,
-- inside the same statement that decides whether to delete anything — a
-- caller's stale read of an organization that got verified a second before
-- this runs must not turn into deleting a real, live business. Returns
-- false and touches nothing when that check fails, the same shape as
-- marea_verify_organization's own "nothing to do" case.
--
-- WHY A LISTING FUNCTION TOO. marea_app can no longer SELECT from
-- "Organization" without a business context (this module's own
-- add_signup_primitive migration scoped that read through
-- marea_business_org). The scheduled task that finds candidates for this
-- cleanup runs outside any request — no business, so no rows, so it would
-- find nothing to clean up, ever. marea_unverified_signups() is that lookup,
-- SECURITY DEFINER like the rest of this module's functions, narrowed to
-- exactly the two ids the deletion above needs and nothing else about the
-- organization.
--
-- Revert with: DROP FUNCTION marea_purge_unverified_signup(text, text);
-- DROP FUNCTION marea_unverified_signups(timestamp);

CREATE FUNCTION marea_purge_unverified_signup(organization_id text, user_id text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS
$$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Organization" WHERE id = organization_id AND "verifiedAt" IS NULL) THEN
    RETURN false;
  END IF;

  DELETE FROM "Business" WHERE "organizationId" = organization_id;
  DELETE FROM "User" WHERE id = user_id;
  DELETE FROM "Organization" WHERE id = organization_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION marea_purge_unverified_signup(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marea_purge_unverified_signup(text, text) TO marea_app;

-- One row per unverified organization older than `cutoff`, paired with the
-- userId of its own signup (the most recent EmailVerificationToken row
-- naming it — there is only ever one, but "most recent" keeps this correct
-- even if that ever changes). An organization with no token at all (should
-- not happen: marea_signup's own caller always creates one in the same
-- request) is skipped rather than guessed at.
CREATE FUNCTION marea_unverified_signups(cutoff timestamp) RETURNS TABLE (organization_id text, user_id text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS
$$
  SELECT o.id, t."userId"
  FROM "Organization" o
  JOIN LATERAL (
    SELECT "userId" FROM "EmailVerificationToken" evt
    WHERE evt."organizationId" = o.id
    ORDER BY evt."createdAt" DESC
    LIMIT 1
  ) t ON true
  WHERE o."verifiedAt" IS NULL AND o."createdAt" < cutoff
$$;

REVOKE ALL ON FUNCTION marea_unverified_signups(timestamp) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marea_unverified_signups(timestamp) TO marea_app;
