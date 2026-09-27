-- Email verification (module 19, phase 3). Hand-written (this project's
-- shadow database, used by `prisma migrate dev`, cannot replay
-- enable_row_level_security cleanly — see that migration's own REVOKE on
-- "_prisma_migrations" — so every migration here is written and applied by
-- hand, this one included, even though its own shape is a plain Prisma diff).
--
-- Organization.verifiedAt is nullable, no default: null means "nobody has
-- proven this address yet", not "unknown". createOrganization() (the
-- operator-run path, scripts/tenants.ts) sets it at creation — nobody is
-- waiting on an email there. marea_signup() (module 19, phase 2) leaves it
-- unset on purpose: that INSERT's own column list still only names id, name
-- and slug, so this column keeps its true default, NULL, without touching
-- that function.
--
-- EmailVerificationToken is not row-level-security scoped, same as
-- PasswordResetToken and the rest of the identity tables the original RLS
-- migration named as out of scope: it is keyed by user, not by business, and
-- marea_app already has ordinary table grants on it from that migration's
-- ALTER DEFAULT PRIVILEGES (a new table created after it inherits them; see
-- that migration's header). No GRANT statement needed here as a result —
-- confirmed against a throwaway Postgres before writing marea_verify_organization
-- below, the same way marea_signup's own void/boolean surprise was confirmed
-- rather than assumed.
--
-- marea_verify_organization() is the narrow SECURITY DEFINER door for the one
-- write marea_app cannot make directly: organization_access (module 19,
-- phase 0) revoked UPDATE on "Organization" along with INSERT/DELETE. This
-- function does exactly one thing — stamp verifiedAt if it is still null —
-- and nothing else about an organization is reachable through it.
--
-- Revert with: DROP FUNCTION marea_verify_organization(text);
-- DROP TABLE "EmailVerificationToken"; ALTER TABLE "Organization" DROP COLUMN "verifiedAt".

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "verifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmailVerificationToken" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash"      TEXT NOT NULL,
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "usedAt"         TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_userId_createdAt_idx" ON "EmailVerificationToken"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailVerificationToken_organizationId_idx" ON "EmailVerificationToken"("organizationId");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION marea_verify_organization(organization_id text) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER SET search_path FROM CURRENT AS
$$
  UPDATE "Organization" SET "verifiedAt" = now()
    WHERE id = organization_id AND "verifiedAt" IS NULL
  RETURNING true
$$;

REVOKE ALL ON FUNCTION marea_verify_organization(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION marea_verify_organization(text) TO marea_app;
