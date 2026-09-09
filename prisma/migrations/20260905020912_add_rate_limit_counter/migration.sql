-- CreateTable
CREATE TABLE "RateLimitCounter" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimitCounter_scope_key_createdAt_idx" ON "RateLimitCounter"("scope", "key", "createdAt");

-- DataMigration: move rows that used LoginAttempt.email as a free-text scope
-- (never containing "@", by the contract assertValidScope used to enforce)
-- into the dedicated table, then drop them from LoginAttempt so it goes
-- back to holding only real login attempts.
INSERT INTO "RateLimitCounter" ("id", "scope", "key", "createdAt")
SELECT md5(la.ctid::text || la."createdAt"::text), la."email", la."ipAddress", la."createdAt"
FROM "LoginAttempt" la
WHERE la."email" NOT LIKE '%@%';

DELETE FROM "LoginAttempt" WHERE "email" NOT LIKE '%@%';
