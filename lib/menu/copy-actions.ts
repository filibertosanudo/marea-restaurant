"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/permissions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { authorizeBusiness } from "@/lib/auth/business-access";
import { getBusinessForRequest } from "@/lib/business";
import { invalidatePublicCache } from "@/lib/cache/public";
import { copyMenu } from "@/lib/menu/copy";
import { getStorageDriver } from "@/lib/storage";

export type CopyMenuActionResult =
  | { ok: true; categories: number; dishes: number; photos: number }
  | { ok: false; error: "forbidden" | "same_business" | "target_not_empty" | "source_empty" };

/**
 * Copies another branch's menu into THIS business (the active one), which must
 * have no menu yet. The caller has to be an administrator here (requireRole) and
 * an administrator of the source too (authorizeBusiness), which is what keeps
 * the source id, taken from the browser, from being any business's id.
 */
export async function copyMenuFromBusinessAction(sourceBusinessId: string): Promise<CopyMenuActionResult> {
  const session = await requireRole(...ADMIN_ROLES);
  const target = await getBusinessForRequest();
  if (typeof sourceBusinessId !== "string" || sourceBusinessId === target.id) return { ok: false, error: "same_business" };

  const roleAtSource = await authorizeBusiness(session.user.id, sourceBusinessId);
  if (!roleAtSource || !ADMIN_ROLES.includes(roleAtSource)) return { ok: false, error: "forbidden" };

  const result = await copyMenu({ sourceBusinessId, targetBusinessId: target.id, storage: getStorageDriver() });
  if (!result.ok) return result;

  invalidatePublicCache("menu", target.id);
  revalidatePath("/admin/menu");
  return result;
}
