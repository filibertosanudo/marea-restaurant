import "server-only";
import { prisma } from "@/lib/prisma";

export async function listTeamMembersRaw(businessId: string) {
  return prisma.businessMembership.findMany({
    where: { businessId },
    orderBy: { createdAt: "asc" },
    include: { user: true },
  });
}
