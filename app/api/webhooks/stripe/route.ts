import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe/client";
import { applyStripeEvent, resolveChargeDetailsForEvent, resolveRefundsForEvent } from "@/lib/payments/webhook-handlers";
import { isUniqueConstraintError } from "@/lib/payments/prisma-errors";
import { Prisma } from "@/lib/generated/prisma/client";

/**
 * The only source of truth for "did this payment actually succeed" — the
 * client returning from Stripe's redirect proves nothing (it's a URL
 * param), so no code path anywhere marks a Payment SUCCEEDED except this
 * handler, driven by Stripe's own signed event.
 *
 * Raw body via request.text() (Next 16 route handlers don't auto-parse),
 * signature verified with STRIPE_WEBHOOK_SECRET, and the eventId insert +
 * the effect it triggers happen in one transaction — Stripe redelivers
 * events, and without that pairing a redelivered "succeeded" would apply
 * twice. Always responds fast with 2xx unless the signature itself is bad;
 * a 500 makes Stripe retry in a loop.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET ?? "");
  } catch {
    return new Response("Invalid signature", { status: 400 });
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

  try {
    await prisma.$transaction(async (tx) => {
      await tx.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          payload: event as unknown as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
      });
      await applyStripeEvent(tx, event, chargeDetails, refunds);
    });
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
