import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getBusinessForRequest } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { listOwnersRaw, listTeamMembersRaw } from "@/lib/team/queries";
import { toTeamMemberDTO, toTeamOwnerDTO } from "@/lib/dto/team";
import { TeamMemberList } from "@/components/admin/team/TeamMemberList";

export default async function TeamPage() {
  const session = await requirePageRole(
    "/admin/menu",
    UserRole.BUSINESS_ADMIN,
    UserRole.SUPER_ADMIN
  );

  const [business, lang] = await Promise.all([getBusinessForRequest(), getAdminLang()]);
  const dict = getDictionary(lang);
  const [members, owners] = await Promise.all([
    listTeamMembersRaw(business.id),
    listOwnersRaw(business.organizationId),
  ]);

  return (
    <TeamMemberList
      members={members.map(toTeamMemberDTO)}
      owners={owners.map(toTeamOwnerDTO)}
      currentUserId={session.user.id}
      dict={dict}
    />
  );
}
