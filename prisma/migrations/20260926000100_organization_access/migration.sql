-- What makes an organization safe to use (module 17, phase 4). Hand-written.
--
-- 1. An ORG_ADMIN has an organization and nobody else does. Enforced by the
--    database rather than hoped for: the token's businessId is checked against
--    the user's organization, so a user with the role and no organization, or
--    an organization on the wrong kind of user, would be a hole.
--
-- 2. Three functions the application needs BEFORE it may see any Business row.
--    Business is scoped to its own row by row level security, so "does this
--    business belong to that organization?" cannot be asked with a query. Like
--    the host-to-id functions in the row level security migration they run as
--    the table owner (SECURITY DEFINER, search_path pinned, revoked from
--    PUBLIC) and return ids, or a name and slug, and nothing else. They decide
--    nothing: who may act on which business is one function in
--    lib/auth/business-access.ts, which is what calls them.
--
-- Revert with: GRANT INSERT, UPDATE, DELETE ON "Organization" TO marea_app; DROP FUNCTION for the three functions, and
-- ALTER TABLE "User" DROP CONSTRAINT user_org_admin_has_organization.

ALTER TABLE "User" ADD CONSTRAINT user_org_admin_has_organization
  CHECK ((role = 'ORG_ADMIN') = ("organizationId" IS NOT NULL));

-- The organization a business belongs to: one row (organization_id may be NULL
-- for a standalone business), or no row when the business does not exist.
CREATE FUNCTION marea_business_org(business_id text) RETURNS TABLE (organization_id text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS
$$ SELECT "organizationId" FROM "Business" WHERE id = business_id AND "deletedAt" IS NULL $$;

-- The businesses of an organization, oldest first: the order in which an
-- ORG_ADMIN lands on one at sign-in.
CREATE FUNCTION marea_organization_business_ids(org_id text) RETURNS SETOF text
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS
$$ SELECT id FROM "Business" WHERE "organizationId" = org_id AND "deletedAt" IS NULL ORDER BY "createdAt", id $$;

-- Name and slug of businesses the caller has already been authorised for, to
-- fill a switcher.
CREATE FUNCTION marea_business_summaries(business_ids text[]) RETURNS TABLE (id text, name text, slug text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path FROM CURRENT AS
$$ SELECT b.id, b.name, b.slug FROM "Business" b WHERE b.id = ANY(business_ids) AND b."deletedAt" IS NULL ORDER BY b.name $$;

-- An organization is created and renamed by the platform operator (with the
-- owner's credentials), never by the running application: it can read one,
-- which is all sign-in and the switcher need.
REVOKE INSERT, UPDATE, DELETE ON "Organization" FROM marea_app;

REVOKE ALL ON FUNCTION marea_business_org(text), marea_organization_business_ids(text), marea_business_summaries(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marea_business_org(text), marea_organization_business_ids(text), marea_business_summaries(text[]) TO marea_app;
