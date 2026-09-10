"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/permissions";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { getCurrentBusiness } from "@/lib/business";
import { isUniqueConstraintError } from "@/lib/payments/prisma-errors";
import { openCashSessionSchema, cashMovementSchema, closeCashSessionSchema } from "./schemas";
import { lockOpenCashSessionForUpdate, getCashSessionActivityRaw } from "./queries";
import { computeExpectedAmount, computeDifference } from "./expected";
import { CashSessionAlreadyOpenError } from "./errors";

export type CashActionState = { error?: string } | undefined;

/** Opening a shift is STAFF work, per the matrix — the cashier does this, not the owner. */
export async function openCashSessionAction(openingFloat: string): Promise<CashActionState> {
  const session = await requireRole(...STAFF_ROLES);
  const business = await getCurrentBusiness();

  const parsed = openCashSessionSchema.safeParse({ openingFloat });
  if (!parsed.success) return { error: "invalid_amount" };

  try {
    await prisma.$transaction(async (tx) => {
      // Fast, clean pre-check for the common (non-concurrent) case — the
      // partial unique index (see the migration) is the actual guarantee,
      // caught below as a P2002, since SELECT ... FOR UPDATE can't lock a
      // row that doesn't exist yet and so can't fully serialize two
      // concurrent opens on its own.
      const existing = await lockOpenCashSessionForUpdate(tx, business.id);
      if (existing) throw new CashSessionAlreadyOpenError();

      await tx.cashSession.create({
        data: { businessId: business.id, openedById: session.user.id, openingFloat: parsed.data.openingFloat },
      });
    });
  } catch (err) {
    if (err instanceof CashSessionAlreadyOpenError || isUniqueConstraintError(err)) {
      return { error: "already_open" };
    }
    throw err;
  }

  revalidatePath("/admin/pedidos");
  revalidatePath("/admin/reportes");
}

/** A deposit or withdrawal that isn't a customer payment — STAFF work, same surface as opening/closing. */
export async function recordCashMovementAction(input: {
  type: "DEPOSIT" | "WITHDRAWAL";
  amount: string;
  reason: string;
}): Promise<CashActionState> {
  const session = await requireRole(...STAFF_ROLES);
  const business = await getCurrentBusiness();

  const parsed = cashMovementSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };

  const result = await prisma.$transaction(async (tx) => {
    const open = await lockOpenCashSessionForUpdate(tx, business.id);
    if (!open) return { error: "no_open_cash_session" } as const;

    await tx.cashMovement.create({
      data: {
        cashSessionId: open.id,
        type: parsed.data.type,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        createdById: session.user.id,
      },
    });
    return undefined;
  });

  if (result?.error) return result;
  revalidatePath("/admin/pedidos");
}

export type CloseCashSessionResult =
  | { ok: true; id: string; difference: string }
  | { ok: false; error: "invalid_input" | "no_open_cash_session" | "note_required" };

/**
 * The system shows what it expects, the cashier types what they counted,
 * and the difference gets frozen either way — a mismatch gets a required
 * note, never a blocked close. A system that refuses to close until the
 * drawer balances produces false corte, not real ones (see the module's
 * own reasoning on this).
 */
export async function closeCashSessionAction(input: {
  countedAmount: string;
  notes?: string;
}): Promise<CloseCashSessionResult> {
  const session = await requireRole(...STAFF_ROLES);
  const business = await getCurrentBusiness();

  const parsed = closeCashSessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const result = await prisma.$transaction(async (tx) => {
    const open = await lockOpenCashSessionForUpdate(tx, business.id);
    if (!open) return { ok: false, error: "no_open_cash_session" } as const;

    const fresh = await tx.cashSession.findUniqueOrThrow({ where: { id: open.id } });
    const activity = await getCashSessionActivityRaw(tx, open.id);
    const expected = computeExpectedAmount({
      openingFloat: fresh.openingFloat,
      cashCollected: activity.cashCollected,
      deposits: activity.deposits,
      withdrawals: activity.withdrawals,
    });
    const counted = new Prisma.Decimal(parsed.data.countedAmount);
    const difference = computeDifference(counted, expected);

    const trimmedNotes = parsed.data.notes?.trim() || null;
    if (!difference.isZero() && !trimmedNotes) {
      return { ok: false, error: "note_required" } as const;
    }

    await tx.cashSession.update({
      where: { id: open.id },
      data: {
        closedById: session.user.id,
        closedAt: new Date(),
        expectedAmount: expected,
        countedAmount: counted,
        difference,
        notes: trimmedNotes,
      },
    });
    return { ok: true, id: open.id, difference: difference.toFixed(2) } as const;
  });

  if (result.ok) {
    revalidatePath("/admin/pedidos");
    revalidatePath("/admin/reportes");
  }
  return result;
}
