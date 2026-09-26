import { handleStripeWebhook } from "@/lib/payments/stripe-webhook";

// Events about the platform's own Stripe account, signed with STRIPE_WEBHOOK_SECRET.
// Everything that matters is in lib/payments/stripe-webhook.ts.
export async function POST(request: Request) {
  return handleStripeWebhook(request, "platform");
}
