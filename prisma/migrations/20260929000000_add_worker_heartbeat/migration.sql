-- Worker liveness, read by /api/status (module 18, phase 5). A single row,
-- upserted by scripts/worker.ts on every loop tick. Platform table, no row
-- level security, same as OpsTaskRun and StripeWebhookEvent. marea_app
-- reads it (through the default privileges the row level security
-- migration already set up); marea_worker needs an explicit grant, since
-- default privileges there only ever covered marea_app.
--
-- Revert with: DROP TABLE "WorkerHeartbeat"; and REVOKE the grant below.

CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

GRANT SELECT, INSERT, UPDATE ON "WorkerHeartbeat" TO marea_worker;
