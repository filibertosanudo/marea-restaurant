import "server-only";
import { prisma } from "@/lib/prisma";

/** The settings panel's own list — every device this business ever provisioned, active or not. */
export function listDevicesForAdmin(businessId: string) {
  return prisma.device.findMany({
    where: { businessId },
    orderBy: { createdAt: "desc" },
  });
}
