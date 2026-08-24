import type { BusinessMembership, User, UserRole } from "@/lib/generated/prisma/client";

export type TeamMemberDTO = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
};

export function toTeamMemberDTO(
  membership: BusinessMembership & { user: User }
): TeamMemberDTO {
  return {
    membershipId: membership.id,
    userId: membership.userId,
    name: membership.user.name ?? "",
    email: membership.user.email ?? "",
    role: membership.role,
    isActive: membership.isActive,
    mustChangePassword: membership.user.mustChangePassword,
  };
}
