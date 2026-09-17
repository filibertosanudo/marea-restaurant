import "server-only";
import { prisma } from "@/lib/prisma";

/** Every closure row for the admin list — unlike getBusinessClosures (reservations' read-only view, id/reason-less by design), this needs both so the screen can label and delete a specific row. */
export async function getBusinessClosuresForAdmin(businessId: string) {
  return prisma.businessClosure.findMany({
    where: { businessId },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, endsAt: true, reason: true },
  });
}
