-- Read-only mode (module 18, phase 6). A row's presence is what the guard
-- checks: written by scripts/ops/read-only.ts, read (cached a few seconds)
-- by lib/ops/read-only.ts. Platform table, no row level security, like
-- OpsTaskRun and WorkerHeartbeat.
--
-- @@unique([scope, organizationId]) covers ORGANIZATION rows correctly (one
-- per organization), but Postgres treats every NULL as distinct from every
-- other NULL, so it would let more than one PLATFORM row (organizationId
-- always NULL there) exist at once — the partial index below is what makes
-- the platform-wide switch an actual singleton. Hand-written: Prisma cannot
-- express a partial index.
--
-- Revert with: DROP TABLE "ReadOnlyMode"; DROP TYPE "ReadOnlyScope";

-- CreateEnum
CREATE TYPE "ReadOnlyScope" AS ENUM ('PLATFORM', 'ORGANIZATION');

-- CreateTable
CREATE TABLE "ReadOnlyMode" (
    "id" TEXT NOT NULL,
    "scope" "ReadOnlyScope" NOT NULL,
    "organizationId" TEXT,
    "reason" TEXT,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabledBy" TEXT,

    CONSTRAINT "ReadOnlyMode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReadOnlyMode_scope_organizationId_key" ON "ReadOnlyMode"("scope", "organizationId");

-- The platform-wide singleton: at most one row with no organization.
CREATE UNIQUE INDEX "ReadOnlyMode_platform_singleton" ON "ReadOnlyMode" ((true)) WHERE "scope" = 'PLATFORM' AND "organizationId" IS NULL;

-- The worker checks this too, to pause instead of claiming new jobs
-- (scripts/worker.ts); marea_app already has full DML through the row
-- level security migration's default privileges.
GRANT SELECT ON "ReadOnlyMode" TO marea_worker;
