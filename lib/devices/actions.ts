"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { deviceSchema } from "@/lib/devices/schemas";
import { generateDeviceToken } from "@/lib/devices/token";

const DEVICES_PATH = "/admin/configuracion";

export type DeviceFormState =
  | { success: true; token: string }
  | { error: string; fieldErrors?: Record<string, string> }
  | undefined;

/** Minting a device credential is exactly the class of action the rest of the panel keeps admin-only — a new token is a new way into the kitchen's order flow, same reasoning as who gets to create a teammate. */
export async function createDeviceAction(
  _prevState: DeviceFormState,
  formData: FormData
): Promise<DeviceFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const parsed = deviceSchema.safeParse({ name: String(formData.get("name") ?? "") });
  if (!parsed.success) {
    const out: Record<string, string> = {};
    for (const issue of parsed.error.issues) out[issue.path.join(".")] = issue.message;
    return { error: "invalid", fieldErrors: out };
  }

  const { token, tokenHash } = generateDeviceToken();
  await prisma.device.create({
    data: { businessId: business.id, name: parsed.data.name, tokenHash },
  });

  revalidatePath(DEVICES_PATH);
  return { success: true, token };
}

export type RotateTokenResult = { ok: true; token: string } | { ok: false; error: "not_found" };

/** Invalidates the old token immediately — overwriting tokenHash in place, same "reissue, don't append" pattern as RestaurantTable's QR rotation. The old token stops authenticating the instant this commits. */
export async function rotateDeviceTokenAction(deviceId: string): Promise<RotateTokenResult> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const { token, tokenHash } = generateDeviceToken();
  const result = await prisma.device.updateMany({
    where: { id: deviceId, businessId: business.id },
    data: { tokenHash, tokenRotatedAt: new Date() },
  });
  if (result.count === 0) return { ok: false, error: "not_found" };

  revalidatePath(DEVICES_PATH);
  return { ok: true, token };
}

/** Deactivate/reactivate — never a hard delete, so PrintJob history (lockedBy pointing at this device's id) keeps meaning "which device printed this" even after the printer is replaced. */
export async function setDeviceActiveAction(deviceId: string, isActive: boolean): Promise<void> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  await prisma.device.updateMany({
    where: { id: deviceId, businessId: business.id },
    data: { isActive },
  });
  revalidatePath(DEVICES_PATH);
}
