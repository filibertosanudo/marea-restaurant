-- Adding a branch from inside the app (module 19, phase 7). Hand-written,
-- the second, narrower primitive the signup migration's header announced.
--
-- WHAT THIS IS. marea_app has no INSERT policy on Business, so an owner
-- adding a branch needs a door, and this is the only one. It never receives an
-- organization id: the organization is the one of the business the connection
-- is already acting for (app.business_id, stamped by the tenant pool from a
-- session that authorizeBusiness vetted). So a caller can grow its own chain
-- and nobody else's. Who may call it (the organization's owner) is decided in
-- TypeScript, like every other permission; what it may do is decided here.
--
-- THE LIMIT, IN THE DATABASE. The plan's branch allowance comes from the
-- caller (lib/billing/plans.ts is where plans live; the database does not know
-- them), NULL for no limit. The count is taken with the organization's row
-- locked, so two requests at once cannot both pass a limit of one.
--
-- WHAT IT COPIES. The new branch starts with the caller's time zone, currency,
-- default locale, tax rate and country (a chain's branches usually share
-- them, and the wizard changes any of them), card payments off, and the
-- wizard from step one. The slug is checked as marea_signup checks it;
-- lib/db/reserved-slugs.test.ts keeps this list equal to the other two.
--
-- Errors, by message prefix (lib/tenants/signup-errors.ts): no_business,
-- unverified_organization, branch_limit, invalid_slug, reserved_slug; a taken
-- slug is the ordinary unique_violation on Business.slug.
--
-- Revert with: DROP FUNCTION marea_add_branch(text, text, text, text, text, integer);

CREATE FUNCTION marea_add_branch(
  business_id text,
  slug text,
  name text,
  translation_id_en text,
  translation_id_es text,
  max_businesses integer
) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path FROM CURRENT AS
$$
DECLARE
  caller "Business"%ROWTYPE;
  org_verified timestamp;
  branches integer;
BEGIN
  SELECT * INTO caller FROM "Business"
    WHERE id = current_setting('app.business_id', true) AND "deletedAt" IS NULL;
  IF caller.id IS NULL OR caller."organizationId" IS NULL THEN
    RAISE EXCEPTION 'no_business';
  END IF;

  SELECT "verifiedAt" INTO org_verified FROM "Organization" WHERE id = caller."organizationId" FOR UPDATE;
  IF org_verified IS NULL THEN
    RAISE EXCEPTION 'unverified_organization';
  END IF;

  SELECT count(*) INTO branches FROM "Business" WHERE "organizationId" = caller."organizationId" AND "deletedAt" IS NULL;
  IF max_businesses IS NOT NULL AND branches >= max_businesses THEN
    RAISE EXCEPTION 'branch_limit: % of %', branches, max_businesses;
  END IF;

  IF slug !~ '^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$' THEN
    RAISE EXCEPTION 'invalid_slug: "%"', slug;
  END IF;

  -- Mirrors RESERVED_SLUGS in lib/business-host.ts exactly.
  IF slug = ANY (ARRAY[
    'www', 'admin', 'api', 'app', 'auth', 'mail', 'smtp', 'imap', 'ftp', 'static', 'assets', 'cdn', 'media',
    'status', 'docs', 'help', 'support', 'billing', 'dashboard', 'login', 'signup', 'root', 'localhost', 'test'
  ]) THEN
    RAISE EXCEPTION 'reserved_slug: "%"', slug;
  END IF;

  INSERT INTO "Business" (id, slug, name, "organizationId", "acceptsOnlinePayment", timezone, currency, "defaultLocale", "taxRate", country, "updatedAt")
    VALUES (business_id, slug, name, caller."organizationId", false, caller.timezone, caller.currency, caller."defaultLocale", caller."taxRate", caller.country, now());

  INSERT INTO "BusinessTranslation" (id, "businessId", locale) VALUES
    (translation_id_en, business_id, 'en'),
    (translation_id_es, business_id, 'es');

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION marea_add_branch(text, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marea_add_branch(text, text, text, text, text, integer) TO marea_app;
