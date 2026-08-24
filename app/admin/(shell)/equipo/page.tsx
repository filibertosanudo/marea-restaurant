import { UserRole } from "@/lib/generated/prisma/client";
import { requirePageRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { getAdminLang } from "@/lib/i18n/cookie";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { listTeamMembersRaw } from "@/lib/team/queries";
import { toTeamMemberDTO } from "@/lib/dto/team";
import { TeamMemberList } from "@/components/admin/team/TeamMemberList";

export default async function TeamPage() {
  const session = await requirePageRole(
    "/admin/menu",
    UserRole.BUSINESS_ADMIN,
    UserRole.SUPER_ADMIN
  );

  const [business, lang] = await Promise.all([getCurrentBusiness(), getAdminLang()]);
  const dict = getDictionary(lang);
  const members = await listTeamMembersRaw(business.id);

  return (
    <TeamMemberList
      members={members.map(toTeamMemberDTO)}
      currentUserId={session.user.id}
      dict={dict}
    />
  );
}
