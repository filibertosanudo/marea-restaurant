import "server-only";
import { prisma } from "@/lib/prisma";

/** The settings panel's own list — every device this business ever provisioned, active or not. */
export function listDevicesForAdmin(businessId: string) {
  return prisma.device.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * What the kitchen screen's printer pill needs and nothing else — a
 * single peripheral per the module's own rule, so "the" active printer is
 * whichever one was seen most recently rather than a specific id the
 * screen would have to be configured with.
 */
export function getActivePrinterStatus(businessId: string) {
  return prisma.device.findFirst({
    where: { businessId, kind: "PRINTER", isActive: true },
    orderBy: { lastSeenAt: "desc" },
    select: { lastSeenAt: true },
  });
}
