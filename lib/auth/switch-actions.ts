"use server";

import { unstable_update } from "@/auth";
import { requireRole } from "@/lib/auth/permissions";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { claimsForSwitch } from "@/lib/auth/token-claims";

export type SwitchBusinessResult = { ok: true } | { ok: false; error: "forbidden" };

/**
 * Moves the signed-in user to another business they may act on, without
 * signing in again. Two checks, and the second is the one that counts: this
 * action refuses early so the screen can say so, and the `jwt` callback asks
 * again before it changes the token (tokenAfterUpdate), because a session
 * update can also be posted straight to the session endpoint. Both go through
 * the one authorisation function that sign-in and the periodic revalidation
 * use (lib/auth/business-access.ts).
 */
export async function switchBusinessAction(businessId: string): Promise<SwitchBusinessResult> {
  const session = await requireRole(...STAFF_ROLES);
  if (typeof businessId !== "string" || !(await claimsForSwitch(session.user.id, businessId))) {
    return { ok: false, error: "forbidden" };
  }

  await unstable_update({ switchBusinessId: businessId } as never);
  return { ok: true };
}
