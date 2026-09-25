-- Organization: a chain, several Business rows under one owner (module 17,
-- phase 4). It only groups. Isolation stays per business (row level security
-- is keyed by Business.id, not by organization), so an organization is never
-- something a query is scoped to.
--
-- ORG_ADMIN is a new UserRole between BUSINESS_ADMIN and SUPER_ADMIN. It is
-- added here and used only in the next migration: Postgres does not let a new
-- enum value be referenced in the transaction that adds it.
--
-- Revert with: drop the two foreign keys and columns, DROP TABLE "Organization".
-- The enum value cannot be removed; leave it unused.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ORG_ADMIN';

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organizationId" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Business_organizationId_idx" ON "Business"("organizationId");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

