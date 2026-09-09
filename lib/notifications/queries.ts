import "server-only";
import { prisma } from "@/lib/prisma";

/** The panel's own table — most recent first, capped at 50 per the module's own spec. */
export function listRecentNotificationJobs(businessId: string, limit = 50) {
  return prisma.notificationJob.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Jobs actually due and still waiting — the number that answers "is the worker keeping up" at a glance. Excludes runAfter in the future (backoff, or a fresh job not due yet), which isn't backlog. */
export function countDueNotificationJobs(businessId: string): Promise<number> {
  return prisma.notificationJob.count({
    where: { businessId, status: "QUEUED", runAfter: { lte: new Date() } },
  });
}
