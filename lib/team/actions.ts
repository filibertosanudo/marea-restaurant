"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { isAdminRole } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { hashPassword } from "@/lib/auth/password";
import { teamMemberSchema } from "@/lib/team/schemas";
import { UserRole } from "@/lib/generated/prisma/client";

const ADMIN_ROLES = [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] as const;

export type TeamMutationResult = { ok: true } | { ok: false; error: "not_found" | "self" | "last_admin" };

/** Active BUSINESS_ADMIN or SUPER_ADMIN memberships in this business — the count that decides whether deactivating or demoting one more would leave nobody in charge. */
function countActiveAdmins(businessId: string) {
  return prisma.businessMembership.count({
    where: { businessId, isActive: true, role: { in: [UserRole.BUSINESS_ADMIN, UserRole.SUPER_ADMIN] } },
  });
}

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

export async function setTeamMemberActiveAction(membershipId: string, isActive: boolean): Promise<TeamMutationResult> {
  const session = await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const membership = await prisma.businessMembership.findFirst({
    where: { id: membershipId, businessId: business.id },
  });
  if (!membership) return { ok: false, error: "not_found" };
  if (membership.userId === session.user.id) {
    // Refuse to let an admin lock themselves out from the UI layer too —
    // requireRole alone wouldn't stop this since it's their own valid session.
    return { ok: false, error: "self" };
  }

  if (!isActive && membership.isActive && isAdminRole(membership.role)) {
    const activeAdmins = await countActiveAdmins(business.id);
    // This membership is one of the ones counted, so 1 means it's the last.
    if (activeAdmins <= 1) {
      return { ok: false, error: "last_admin" };
    }
  }

  if (membership.isActive === isActive) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.businessMembership.update({ where: { id: membershipId }, data: { isActive } });
    await tx.membershipEvent.create({
      data: {
        membershipId,
        changedById: session.user.id,
        fromActive: membership.isActive,
        toActive: isActive,
      },
    });
  });

  revalidatePath("/admin/equipo");
  return { ok: true };
}

/**
 * Restrictions mirror setTeamMemberActiveAction: nobody changes their own
 * role, and demoting the last active admin out of that role is refused the
 * same way deactivating them is.
 */
export async function setTeamMemberRoleAction(
  membershipId: string,
  role: "STAFF" | "BUSINESS_ADMIN"
): Promise<TeamMutationResult> {
  const session = await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const membership = await prisma.businessMembership.findFirst({
    where: { id: membershipId, businessId: business.id },
  });
  if (!membership) return { ok: false, error: "not_found" };
  if (membership.userId === session.user.id) {
    return { ok: false, error: "self" };
  }

  const isDemotion = membership.isActive && isAdminRole(membership.role) && !isAdminRole(role);
  if (isDemotion) {
    const activeAdmins = await countActiveAdmins(business.id);
    if (activeAdmins <= 1) {
      return { ok: false, error: "last_admin" };
    }
  }

  if (membership.role === role) return { ok: true };

  await prisma.$transaction(async (tx) => {
    await tx.businessMembership.update({ where: { id: membershipId }, data: { role } });
    await tx.membershipEvent.create({
      data: {
        membershipId,
        changedById: session.user.id,
        fromRole: membership.role,
        toRole: role,
      },
    });
  });

  revalidatePath("/admin/equipo");
  return { ok: true };
}
