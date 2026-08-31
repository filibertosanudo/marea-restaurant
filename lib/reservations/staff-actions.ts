"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/auth/permissions";
import { STAFF_ROLES, ADMIN_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { canTransitionReservation } from "./state-machine";
import { isTableFreeForRange, BLOCKING_STATUSES } from "./availability";
import { getReservationsOverlapping } from "./queries";
import { isExclusionConstraintError } from "./prisma-errors";
import type { Prisma, Reservation, ReservationStatus, UserRole } from "@/lib/generated/prisma/client";

export type ReservationActionState = { error?: string } | undefined;

/** Every action below needs the same "wrong role → graceful {error}, not a thrown 500" translation cancelReservationAction already did on its own — pulled out so all five agree instead of one drifting from the other four. */
async function requireRoleOrForbidden(...roles: UserRole[]): Promise<{ error: "forbidden" } | undefined> {
  try {
    await requireRole(...roles);
  } catch (err) {
    if (err instanceof ForbiddenError) return { error: "forbidden" };
    throw err;
  }
}

/**
 * Locks the same way board-actions.ts's lockOrderForUpdate locks an Order —
 * two tablets confirming or seating the same reservation at once is the
 * normal case for a host stand, not the rare one, and every action below
 * needs to serialize against every other one on the same row. Selects the
 * whole row (no @map on this model, so its columns already match
 * Reservation's field names) instead of just `id`, so the lock and the
 * read that always follows it are the same round trip.
 */
async function lockReservationForUpdate(
  tx: Prisma.TransactionClient,
  businessId: string,
  reservationId: string
): Promise<Reservation | undefined> {
  const rows = await tx.$queryRaw<Reservation[]>`
    SELECT * FROM "Reservation" WHERE id = ${reservationId} AND "businessId" = ${businessId} FOR UPDATE
  `;
  return rows[0];
}

/**
 * The shared shape every plain status transition below follows: lock,
 * validate against the state machine, optionally run one more check that
 * the graph itself can't express, write. confirmReservationAction doesn't
 * use this directly — its optional table reassignment needs an extra step
 * in between.
 */
async function transitionReservation(
  tx: Prisma.TransactionClient,
  businessId: string,
  reservationId: string,
  targetStatus: ReservationStatus,
  extraData: Record<string, unknown> = {},
  guard?: (reservation: Reservation) => string | undefined
): Promise<{ error: string } | undefined> {
  const reservation = await lockReservationForUpdate(tx, businessId, reservationId);
  if (!reservation) return { error: "not_found" };
  if (!canTransitionReservation(reservation.status, targetStatus)) return { error: "invalid_transition" };
  const guardError = guard?.(reservation);
  if (guardError) return { error: guardError };

  await tx.reservation.update({ where: { id: reservationId }, data: { status: targetStatus, ...extraData } });
  return undefined;
}

/**
 * The overlap/capacity check a table reassignment needs, shared by
 * confirmReservationAction's optional reassign-while-confirming and
 * reassignReservationTableAction's standalone version — the same
 * availability.ts overlap check creation itself uses, so a reassignment
 * can never be validated by a rule creation doesn't also use.
 */
async function checkTableForReassignment(
  tx: Prisma.TransactionClient,
  businessId: string,
  reservation: Reservation,
  tableId: string
): Promise<{ error: "table_not_found" | "table_too_small" | "table_taken" } | { tableId: string }> {
  const table = await tx.restaurantTable.findFirst({
    where: { id: tableId, businessId, isActive: true, deletedAt: null },
  });
  if (!table) return { error: "table_not_found" };
  if (table.seats < reservation.partySize) return { error: "table_too_small" };

  const overlapping = await getReservationsOverlapping(tx, businessId, reservation.reservedFor, reservation.endsAt);
  if (!isTableFreeForRange(tableId, reservation.reservedFor, reservation.endsAt, overlapping, reservation.id)) {
    return { error: "table_taken" };
  }
  return { tableId };
}

/**
 * STAFF and up, per the permission matrix — confirming is staff work, not
 * an admin-only one. `tableId` is optional: most confirmations keep the
 * table createReservationAction already assigned, but a staff member can
 * reassign to a different one here. The EXCLUDE constraint is still the
 * last word — a race with another confirm or a concurrent booking is
 * caught here exactly like it is at creation, never a raw 500.
 */
export async function confirmReservationAction(
  reservationId: string,
  tableId?: string
): Promise<ReservationActionState> {
  const forbidden = await requireRoleOrForbidden(...STAFF_ROLES);
  if (forbidden) return forbidden;
  const business = await getCurrentBusiness();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await lockReservationForUpdate(tx, business.id, reservationId);
      if (!reservation) return { error: "not_found" } as const;
      if (!canTransitionReservation(reservation.status, "CONFIRMED")) {
        return { error: "invalid_transition" } as const;
      }

      let finalTableId = reservation.tableId;

      if (tableId && tableId !== reservation.tableId) {
        const outcome = await checkTableForReassignment(tx, business.id, reservation, tableId);
        if ("error" in outcome) return outcome;
        finalTableId = outcome.tableId;
      }

      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: "CONFIRMED", confirmedAt: new Date(), tableId: finalTableId },
      });
      return undefined;
    });

    if (result?.error) return result;
  } catch (err) {
    if (isExclusionConstraintError(err)) return { error: "table_taken" };
    throw err;
  }

  revalidatePath("/admin/reservaciones");
}

/**
 * STAFF and up — moving a reservation to a different table without
 * touching its status, for the cases confirming-time reassignment can't
 * cover: a table breaks, a party grows, or a reservation that's already
 * CONFIRMED (or even SEATED) needs to move. Only legal while the
 * reservation is still holding a table at all (BLOCKING_STATUSES) — a
 * COMPLETED/CANCELLED/NO_SHOW reservation has nothing left to reassign.
 */
export async function reassignReservationTableAction(
  reservationId: string,
  tableId: string
): Promise<ReservationActionState> {
  const forbidden = await requireRoleOrForbidden(...STAFF_ROLES);
  if (forbidden) return forbidden;
  const business = await getCurrentBusiness();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await lockReservationForUpdate(tx, business.id, reservationId);
      if (!reservation) return { error: "not_found" } as const;
      if (!BLOCKING_STATUSES.includes(reservation.status)) return { error: "invalid_transition" } as const;
      if (tableId === reservation.tableId) return undefined;

      const outcome = await checkTableForReassignment(tx, business.id, reservation, tableId);
      if ("error" in outcome) return outcome;

      await tx.reservation.update({ where: { id: reservationId }, data: { tableId: outcome.tableId } });
      return undefined;
    });

    if (result?.error) return result;
  } catch (err) {
    if (isExclusionConstraintError(err)) return { error: "table_taken" };
    throw err;
  }

  revalidatePath("/admin/reservaciones");
}

/** STAFF and up — the point a confirmed party actually arrives. Deliberately doesn't touch RestaurantTable.status; see the module notes on why. */
export async function seatReservationAction(reservationId: string): Promise<ReservationActionState> {
  const forbidden = await requireRoleOrForbidden(...STAFF_ROLES);
  if (forbidden) return forbidden;
  const business = await getCurrentBusiness();

  const result = await prisma.$transaction((tx) =>
    transitionReservation(tx, business.id, reservationId, "SEATED", { seatedAt: new Date() })
  );
  if (result?.error) return result;
  revalidatePath("/admin/reservaciones");
}

/** STAFF and up — closes out a seated party once they've left. */
export async function completeReservationAction(reservationId: string): Promise<ReservationActionState> {
  const forbidden = await requireRoleOrForbidden(...STAFF_ROLES);
  if (forbidden) return forbidden;
  const business = await getCurrentBusiness();

  const result = await prisma.$transaction((tx) => transitionReservation(tx, business.id, reservationId, "COMPLETED"));
  if (result?.error) return result;
  revalidatePath("/admin/reservaciones");
}

/**
 * STAFF and up — a party that never showed. CONFIRMED can be marked
 * no-show any time staff judges the party isn't coming; PENDING's
 * no-show path is only for a reservation that's already overdue (the
 * agenda only ever renders that button once `isOverdue` is true) —
 * enforced here too, not just by the button being hidden, so a direct
 * call can't mark a reservation that hasn't even started yet.
 */
export async function markNoShowAction(reservationId: string): Promise<ReservationActionState> {
  const forbidden = await requireRoleOrForbidden(...STAFF_ROLES);
  if (forbidden) return forbidden;
  const business = await getCurrentBusiness();

  const result = await prisma.$transaction((tx) =>
    transitionReservation(tx, business.id, reservationId, "NO_SHOW", {}, (reservation) =>
      reservation.status === "PENDING" && reservation.reservedFor.getTime() >= Date.now() ? "not_overdue" : undefined
    )
  );
  if (result?.error) return result;
  revalidatePath("/admin/reservaciones");
}

/**
 * BUSINESS_ADMIN+ only, per the permission matrix — cancelling takes
 * something away from the guest, same reasoning as cancelling an order.
 */
export async function cancelReservationAction(
  reservationId: string,
  reason: string
): Promise<ReservationActionState> {
  const forbidden = await requireRoleOrForbidden(...ADMIN_ROLES);
  if (forbidden) return forbidden;

  const business = await getCurrentBusiness();
  const trimmedReason = reason.trim();
  if (!trimmedReason) return { error: "reason_required" };

  const result = await prisma.$transaction((tx) =>
    transitionReservation(tx, business.id, reservationId, "CANCELLED", {
      cancelledAt: new Date(),
      cancellationReason: trimmedReason,
    })
  );
  if (result?.error) return result;
  revalidatePath("/admin/reservaciones");
}
