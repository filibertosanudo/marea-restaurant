-- CreateTable
CREATE TABLE "OrderCounter" (
    "businessId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderCounter_pkey" PRIMARY KEY ("businessId","localDate")
);
