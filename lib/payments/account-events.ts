import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { expireBusinessCache } from "@/lib/business";
import { runInTenant } from "@/lib/tenancy/context";
import { businessIdForStripeAccount } from "@/lib/tenancy/discover";
import { readCardPaymentsStatus } from "@/lib/stripe/connect";
import { isUniqueConstraintError } from "@/lib/payments/prisma-errors";
import { Prisma, type StripeCapabilityStatus } from "@/lib/generated/prisma/client";

/**
 * What Stripe tells the platform about a connected account itself, as opposed to
 * its payments (module 17b, phase 6). Only ever called for a Connect event whose
 * signature was verified, so the `account` it carries is Stripe's.
 *
 * - `account.updated`: the account's capabilities may have changed. The answer is
 *   not taken from the event (its shape is the v1 account's, ours is the v2
 *   four-state one) but asked of Stripe about the account the event names. An
 *   account that became restricted stops offering cards without anybody opening
 *   the settings. If that read fails, the event's own capability decides in the
 *   safe direction only: anything but "active" turns cards off, and "active"
 *   changes nothing until a read can confirm it.
 * - `account.application.deauthorized`: the business disconnected the platform
 *   from its Stripe account. It cannot charge, from that moment, with no manual
 *   step: the account id is cleared (its old payments keep their own on the
 *   Payment row, so refunds and their events still find them), the status is
 *   left as "restricted" so that it does not fall back to the platform's own key
 *   (see lib/payments/availability.ts), and online payment is switched off.
 *
 * An event for an account no business holds (already disconnected, or never
 * ours) changes nothing.
 */
type AccountEvent = Stripe.Event & { account: string };

export function isAccountEvent(event: Stripe.Event): boolean {
  return event.type === "account.updated" || event.type === "account.application.deauthorized";
}

export async function applyAccountEvent(event: Stripe.Event): Promise<void> {
  const account = event.account;
  if (!account) return;
  const businessId = await businessIdForStripeAccount(account);
  if (!businessId) return;
  const accountEvent = event as AccountEvent;

  if (event.type === "account.application.deauthorized") {
    await recordOnce(businessId, accountEvent, async (tx) => {
      // Conditional on the account still being this one: a business that has
      // already connected another since must not lose that one to a late event.
      const written = await tx.business.updateMany({
        where: { id: businessId, stripeAccountId: account },
        data: { stripeAccountId: null, stripeCardPaymentsStatus: "RESTRICTED", stripeStatusCheckedAt: new Date(), acceptsOnlinePayment: false },
      });
      return written.count > 0;
    });
    return;
  }

  const status = await statusFor(accountEvent);
  if (!status) return;
  await recordOnce(businessId, accountEvent, async (tx) => {
    const written = await tx.business.updateMany({
      where: { id: businessId, stripeAccountId: account },
      data: { stripeCardPaymentsStatus: status, stripeStatusCheckedAt: new Date() },
    });
    return written.count > 0;
  });
}

/** The state to store for an `account.updated`, or null when nothing should change. */
async function statusFor(event: AccountEvent): Promise<StripeCapabilityStatus | null> {
  try {
    const reading = await readCardPaymentsStatus(event.account);
    // The event and the read must be about the same mode; if not, neither is trusted.
    if (Boolean(event.livemode) !== reading.livemode) return null;
    return reading.status;
  } catch (err) {
    console.error("[stripe webhook] could not read account", event.account, err);
    const capability = (event.data.object as { capabilities?: { card_payments?: string } }).capabilities?.card_payments;
    return capability === "active" ? null : "RESTRICTED";
  }
}

/**
 * The write and the idempotency record of the event, in one transaction inside
 * the business, so a redelivery is a no-op and a failed write leaves no record
 * that would make its retry look already done. The cache is expired only when a
 * row really changed.
 */
async function recordOnce(
  businessId: string,
  event: AccountEvent,
  write: (tx: Prisma.TransactionClient) => Promise<boolean>
): Promise<void> {
  let changed = false;
  try {
    await runInTenant(businessId, () =>
      prisma.$transaction(async (tx) => {
        await tx.stripeWebhookEvent.create({
          data: { eventId: event.id, type: event.type, payload: event as unknown as Prisma.InputJsonValue, processedAt: new Date() },
        });
        changed = await write(tx);
      })
    );
  } catch (err) {
    if (isUniqueConstraintError(err)) return; // a redelivery of an event already applied
    throw err;
  }
  if (!changed) return;
  const business = await runInTenant(businessId, () => prisma.business.findUnique({ where: { id: businessId }, select: { id: true, slug: true } }));
  if (business) expireBusinessCache(business);
}
