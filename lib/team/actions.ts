"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { getCurrentBusiness } from "@/lib/business";
import { hashPassword } from "@/lib/auth/password";
import { teamMemberSchema } from "@/lib/team/schemas";
import { UserRole } from "@/lib/generated/prisma/client";

const ADMIN_ROLES = [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] as const;

export type TeamFormState =
  | { success: true; temporaryPassword: string }
  | { error: string; fieldErrors?: Record<string, string> }
  | undefined;

// Not meant to be memorable — the admin hands it to the employee once, who
// changes it on first login (mustChangePassword). Excludes visually
// ambiguous characters (0/O, 1/l/I).
function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `${out}!`;
}

export async function createTeamMemberAction(
  _prevState: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const parsed = teamMemberSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "STAFF"),
  });
  if (!parsed.success) {
    const out: Record<string, string> = {};
    for (const issue of parsed.error.issues) out[issue.path.join(".")] = issue.message;
    return { error: "invalid", fieldErrors: out };
  }
  const { name, email, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "email_taken", fieldErrors: { email: "Email already in use" } };
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      mustChangePassword: true,
      role: UserRole.CUSTOMER, // platform role; the real role lives on the membership
      memberships: {
        create: { businessId: business.id, role, isActive: true },
      },
    },
  });

  revalidatePath("/admin/equipo");
  return { success: true, temporaryPassword };
}

export async function setTeamMemberActiveAction(membershipId: string, isActive: boolean) {
  const session = await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const membership = await prisma.businessMembership.findFirst({
    where: { id: membershipId, businessId: business.id },
  });
  if (!membership) return;
  if (membership.userId === session.user.id) {
    // Refuse to let an admin lock themselves out from the UI layer too —
    // requireRole alone wouldn't stop this since it's their own valid session.
    return;
  }

  await prisma.businessMembership.update({
    where: { id: membershipId },
    data: { isActive },
  });
  revalidatePath("/admin/equipo");
}
