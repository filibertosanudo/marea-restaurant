-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "minBookingLeadMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "minCancelLeadMinutes" INTEGER NOT NULL DEFAULT 120;
