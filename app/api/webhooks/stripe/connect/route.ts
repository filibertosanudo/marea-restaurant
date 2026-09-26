import { handleStripeWebhook } from "@/lib/payments/stripe-webhook";

// Events about connected accounts (their payments and their state), signed with
// STRIPE_CONNECT_WEBHOOK_SECRET. Everything that matters is in lib/payments/stripe-webhook.ts.
export async function POST(request: Request) {
  return handleStripeWebhook(request, "connect");
}
