"use server";

import { revalidatePath } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { Prisma } from "@/lib/generated/prisma/client";
import { BLOCKING_STATUSES } from "@/lib/reservations/availability";
import { tableSchema, batchTableSchema } from "./schemas";
import { getCodesWithPrefix } from "./queries";
import { nextTableCodes } from "./codes";

export type TableFormState =
  | { success: true }
  | { error: string; fieldErrors?: Record<string, string> }
  | undefined;

function flatten(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[issue.path.join(".")] = issue.message;
  return out;
}

/** True for a violation of the businessId+code unique constraint — the collision batch-create's own numbering is meant to avoid, but a concurrent create (two admins, two tabs) can still race it. Explained to the admin, never a raw 500. */
function isCodeTakenError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function createTableAction(
  _prevState: TableFormState,
  formData: FormData
): Promise<TableFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const parsed = tableSchema.safeParse({
    code: formData.get("code"),
    zone: formData.get("zone"),
    seats: formData.get("seats"),
  });
  if (!parsed.success) return { error: "invalid", fieldErrors: flatten(parsed.error) };

  const maxSortOrder = await prisma.restaurantTable.aggregate({
    where: { businessId: business.id },
    _max: { sortOrder: true },
  });

  try {
    await prisma.restaurantTable.create({
      data: {
        businessId: business.id,
        code: parsed.data.code,
        zone: parsed.data.zone,
        seats: parsed.data.seats,
        sortOrder: (maxSortOrder._max.sortOrder ?? 0) + 1,
      },
    });
  } catch (err) {
    if (isCodeTakenError(err)) return { error: "code_taken", fieldErrors: { code: "code_taken" } };
    throw err;
  }

  revalidatePath("/admin/mesas");
  return { success: true };
}

/**
 * Alta en lote: the normal case, not the rare one — nobody adds a
 * restaurant's tables one row at a time. Codes are generated server-side
 * from what already exists under the prefix (nextTableCodes), so the admin
 * only picks a zone, a seat count, and how many.
 */
export async function createTablesBatchAction(
  _prevState: TableFormState,
  formData: FormData
): Promise<TableFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const parsed = batchTableSchema.safeParse({
    zone: formData.get("zone"),
    seats: formData.get("seats"),
    quantity: formData.get("quantity"),
    codePrefix: formData.get("codePrefix"),
  });
  if (!parsed.success) return { error: "invalid", fieldErrors: flatten(parsed.error) };

  const existingCodes = await getCodesWithPrefix(business.id, parsed.data.codePrefix);
  const codes = nextTableCodes(existingCodes, parsed.data.codePrefix, parsed.data.quantity);

  const maxSortOrder = await prisma.restaurantTable.aggregate({
    where: { businessId: business.id },
    _max: { sortOrder: true },
  });
  const startingSortOrder = (maxSortOrder._max.sortOrder ?? 0) + 1;

  try {
    await prisma.restaurantTable.createMany({
      data: codes.map((code, index) => ({
        businessId: business.id,
        code,
        zone: parsed.data.zone,
        seats: parsed.data.seats,
        sortOrder: startingSortOrder + index,
      })),
    });
  } catch (err) {
    // A concurrent create from another tab claimed one of these codes
    // between the read above and this write — rare, but explained rather
    // than a raw 500. Re-running the batch picks up fresh numbering.
    if (isCodeTakenError(err)) return { error: "code_taken" };
    throw err;
  }

  revalidatePath("/admin/mesas");
  return { success: true };
}

export async function updateTableAction(
  _prevState: TableFormState,
  formData: FormData
): Promise<TableFormState> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "missing_id" };

  const parsed = tableSchema.safeParse({
    code: formData.get("code"),
    zone: formData.get("zone"),
    seats: formData.get("seats"),
  });
  if (!parsed.success) return { error: "invalid", fieldErrors: flatten(parsed.error) };

  const table = await prisma.restaurantTable.findFirst({
    where: { id, businessId: business.id, deletedAt: null },
  });
  if (!table) return { error: "not_found" };

  try {
    await prisma.restaurantTable.update({
      where: { id },
      data: { code: parsed.data.code, zone: parsed.data.zone, seats: parsed.data.seats },
    });
  } catch (err) {
    if (isCodeTakenError(err)) return { error: "code_taken", fieldErrors: { code: "code_taken" } };
    throw err;
  }

  revalidatePath("/admin/mesas");
  return { success: true };
}

export async function toggleTableActiveAction(id: string, isActive: boolean): Promise<void> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.restaurantTable.update({
    where: { id, businessId: business.id },
    data: { isActive },
  });
  revalidatePath("/admin/mesas");
}

/** The one manually-set half of TableStatus (see the enum's own comment in schema.prisma) — a table that's physically out of commission, not a live occupancy signal. */
export async function toggleOutOfServiceAction(id: string, outOfService: boolean): Promise<void> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.restaurantTable.update({
    where: { id, businessId: business.id },
    data: { status: outOfService ? "OUT_OF_SERVICE" : "AVAILABLE" },
  });
  revalidatePath("/admin/mesas");
}

export async function reorderTablesAction(orderedIds: string[]): Promise<void> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.restaurantTable.update({
        where: { id, businessId: business.id },
        data: { sortOrder: index },
      })
    )
  );
  revalidatePath("/admin/mesas");
}

/**
 * Rotating a QR is its own destructive action — the old code stops
 * resolving the moment this commits, so the sheet already taped to that
 * table needs reprinting. Nothing here migrates or empties open carts:
 * a Cart keys off `tableId` (stable), not `qrToken` (rotatable) — a guest
 * already mid-order never re-resolves the token after their first scan, so
 * rotation only affects *future* scans of the now-invalid physical code,
 * never a cart already in progress.
 */
export async function rotateTableQrAction(id: string): Promise<{ error?: string }> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const table = await prisma.restaurantTable.findFirst({
    where: { id, businessId: business.id, deletedAt: null },
  });
  if (!table) return { error: "not_found" };

  // @default(cuid(2)) only fires at create time — Prisma never re-runs a
  // column default on update, so the new token has to be generated here,
  // with the same generator Prisma itself uses for the default.
  await prisma.restaurantTable.update({
    where: { id },
    data: { qrToken: createId(), qrRotatedAt: new Date() },
  });
  revalidatePath("/admin/mesas");
  revalidatePath("/admin/mesas/imprimir");
  return {};
}

/**
 * Soft-delete, blocked while a reservation still holding this table exists
 * (BLOCKING_STATUSES — the same rule availability.ts uses to decide which
 * reservations occupy a table at all). Reservation.tableId has
 * onDelete: SetNull, but a nulled tableId doesn't reserve anything against
 * the EXCLUDE constraint — silently letting the delete through would leave
 * a real upcoming guest with no table at all.
 */
export async function deleteTableAction(id: string): Promise<{ blocked: boolean }> {
  await requireRole(...ADMIN_ROLES);
  const business = await getCurrentBusiness();

  const blockingCount = await prisma.reservation.count({
    where: { tableId: id, businessId: business.id, status: { in: BLOCKING_STATUSES } },
  });
  if (blockingCount > 0) return { blocked: true };

  await prisma.restaurantTable.update({
    where: { id, businessId: business.id },
    data: { deletedAt: new Date(), isActive: false },
  });
  revalidatePath("/admin/mesas");
  return { blocked: false };
}
