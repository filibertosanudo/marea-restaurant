-- CreateTable
CREATE TABLE "MembershipEvent" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "changedById" TEXT,
    "fromRole" "UserRole",
    "toRole" "UserRole",
    "fromActive" BOOLEAN,
    "toActive" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MembershipEvent_membershipId_createdAt_idx" ON "MembershipEvent"("membershipId", "createdAt");

-- AddForeignKey
ALTER TABLE "MembershipEvent" ADD CONSTRAINT "MembershipEvent_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "BusinessMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipEvent" ADD CONSTRAINT "MembershipEvent_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
