import "server-only";
import { prisma } from "@/lib/prisma";

/** The team a BUSINESS_ADMIN manages: memberships of everybody except the organization's owners, who are listed apart (listOwnersRaw) and not editable here. */
export async function listTeamMembersRaw(businessId: string) {
  return prisma.businessMembership.findMany({
    where: { businessId, user: { role: { not: "ORG_ADMIN" } } },
    orderBy: { createdAt: "asc" },
    include: { user: true },
  });
}

/** The ORG_ADMINs of an organization: its owners, in every one of its businesses. Empty for a business with no organization. */
export async function listOwnersRaw(organizationId: string | null) {
  if (!organizationId) return [];
  return prisma.user.findMany({
    where: { role: "ORG_ADMIN", organizationId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  });
}
