import "server-only";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { runInTenant } from "@/lib/tenancy/context";
import { paymentOwnerForIntent } from "@/lib/tenancy/discover";
import { constructWebhookEvent } from "@/lib/stripe/payments";
import { platformKeyIsLive } from "@/lib/stripe/mode";
import { applyStripeEvent, resolveChargeDetailsForEvent, resolveRefundsForEvent } from "@/lib/payments/webhook-handlers";
import { isAccountEvent, applyAccountEvent } from "@/lib/payments/account-events";
import { isUniqueConstraintError } from "@/lib/payments/prisma-errors";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * Stripe's webhooks, for both endpoints (module 17b, phase 6).
 *
 * The only source of truth for "did this payment actually succeed" — the
 * client returning from Stripe's redirect proves nothing (it's a URL
 * param), so no code path anywhere marks a Payment SUCCEEDED except this
 * handler, driven by Stripe's own signed event.
 *
 * TWO ENDPOINTS, ONE HANDLER. Events about the platform's own account arrive at
 * `/api/webhooks/stripe`, signed with STRIPE_WEBHOOK_SECRET; events about a
 * connected account (its payments, its state) arrive at
 * `/api/webhooks/stripe/connect`, signed with STRIPE_CONNECT_WEBHOOK_SECRET,
 * and carry the account's id in `account`. Each endpoint verifies against its own
 * secret only, so an event signed for one is not accepted by the other, and each
 * then refuses an event that is not of its kind (a platform event carrying an
 * `account`, a Connect event without one). A refusal is logged and answered 2xx,
 * because retrying cannot fix it, and touches no row.
 *
 * THE ACCOUNT MUST MATCH THE PAYMENT. The account an event carries has to be the
 * one stored on the Payment row it names (both absent counts as equal: the
 * platform's own). If not, nothing is applied: an event that could apply a
 * charge to the wrong business is the most expensive failure this system has.
 *
 * Raw body via request.text() (Next 16 route handlers don't auto-parse), and the
 * eventId insert + the effect it triggers happen in one transaction — Stripe
 * redelivers events, and without that pairing a redelivered "succeeded" would
 * apply twice. Event ids are unique across accounts and endpoints, so the one
 * unique index on StripeWebhookEvent serves both. Always responds fast with 2xx
 * unless the signature itself is bad; a 500 makes Stripe retry in a loop.
 */
export type WebhookKind = "platform" | "connect";

const ENDPOINT = { platform: "/api/webhooks/stripe", connect: "/api/webhooks/stripe/connect" } as const;

function secretFor(kind: WebhookKind): string | undefined {
  return kind === "connect" ? env.STRIPE_CONNECT_WEBHOOK_SECRET : env.STRIPE_WEBHOOK_SECRET;
}

/** Answers 2xx and changes nothing: the event is not one this endpoint may apply, and a retry would say the same. */
function ignored(kind: WebhookKind, event: Stripe.Event, why: string): Response {
  console.error(`[stripe webhook] ${ENDPOINT[kind]} ignored ${event.type} ${event.id}: ${why}`);
  return Response.json({ received: true, ignored: true });
}

export async function handleStripeWebhook(request: Request, kind: WebhookKind): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const secret = secretFor(kind);
  if (!secret) {
    // A misconfiguration, not a bad request: say which variable, in the log an operator reads.
    console.error(`[stripe webhook] ${ENDPOINT[kind]} has no signing secret: set ${kind === "connect" ? "STRIPE_CONNECT_WEBHOOK_SECRET" : "STRIPE_WEBHOOK_SECRET"}`);
    return new Response("Webhook secret not configured", { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  // An account's events belong to one mode; a key of the other mode has nothing to say about them.
  if (Boolean(event.livemode) !== platformKeyIsLive()) return ignored(kind, event, "event and key are in different modes");

  const account = event.account ?? null;
  if (kind === "platform" && account) return ignored(kind, event, `carries account ${account}, which belongs to the Connect endpoint`);
  if (kind === "connect" && !account) return ignored(kind, event, "carries no account, which belongs to the platform endpoint");

  if (isAccountEvent(event)) {
    if (kind !== "connect") return ignored(kind, event, "an account event on the platform endpoint");
    try {
      await applyAccountEvent(event);
    } catch (err) {
      console.error("Stripe webhook: account event failed", event.type, err);
      return new Response("Webhook handler error", { status: 500 });
    }
    return Response.json({ received: true });
  }

  // The event is signed, so the PaymentIntent it names is trustworthy; the
  // business it belongs to is found from it, and the write happens inside
  // that business like any other. An event that names no known payment acts
  // for nobody and so changes nothing but its own idempotency record.
  const intentId = paymentIntentIdOf(event);
  const owner = intentId ? await paymentOwnerForIntent(intentId) : null;
  if (owner && owner.stripeAccountId !== account) {
    return ignored(kind, event, `names payment intent ${intentId}, which was charged on ${owner.stripeAccountId ?? "the platform account"}, not ${account ?? "the platform account"}`);
  }
  // Best-effort enrichment only (brand/last4/receipt) — a network blip or
  // rate limit here must not turn into a 500 that sends Stripe into its
  // retry loop for an event this app can otherwise apply just fine.
  // Unlike resolveRefundsForEvent below, losing this never misrepresents
  // money: the Payment row still gets marked SUCCEEDED, just without the
  // card's last four digits, backfillable later.
  let chargeDetails: Awaited<ReturnType<typeof resolveChargeDetailsForEvent>>;
  try {
    chargeDetails = await resolveChargeDetailsForEvent(event);
  } catch (err) {
    console.error("Stripe webhook: failed to resolve charge details", event.type, err);
    chargeDetails = null;
  }
  const refunds = await resolveRefundsForEvent(event);

  const businessId = owner?.businessId ?? null;
  const inBusiness = <T,>(fn: () => Promise<T>) => (businessId ? runInTenant(businessId, fn) : fn());

  try {
    await inBusiness(() => prisma.$transaction(async (tx) => {
      await tx.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          payload: event as unknown as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
      });
      await applyStripeEvent(tx, event, chargeDetails, refunds);
    }));
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      // Already processed this event id — a Stripe redelivery. 2xx, no-op.
      return Response.json({ received: true });
    }
    console.error("Stripe webhook handling failed", event.type, err);
    return new Response("Webhook handler error", { status: 500 });
  }

  return Response.json({ received: true });
}

/** The PaymentIntent an event is about, whichever object it carries: the intent itself, or a charge or refund that points at one. */
function paymentIntentIdOf(event: Stripe.Event): string | null {
  const object = event.data.object as { object?: string; id?: string; payment_intent?: string | { id: string } | null };
  if (object.object === "payment_intent") return object.id ?? null;
  const ref = object.payment_intent;
  if (typeof ref === "string") return ref;
  return ref?.id ?? null;
}
