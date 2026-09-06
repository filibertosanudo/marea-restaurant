"use server";

import { prisma } from "@/lib/prisma";

export type UnsubscribeResult = { ok: true } | { ok: false; error: "not_found" };

/**
 * No session required, by design — the only proof of identity is the
 * unguessable token in the email link itself (same cuid(2) capability-token
 * pattern as Order.publicToken). Idempotent: unsubscribing twice is a no-op,
 * not an error.
 */
export async function unsubscribeAction(token: string): Promise<UnsubscribeResult> {
  const subscriber = await prisma.newsletterSubscriber.findUnique({
    where: { unsubscribeToken: token },
  });
  if (!subscriber) return { ok: false, error: "not_found" };

  if (!subscriber.unsubscribedAt) {
    await prisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: { unsubscribedAt: new Date() },
    });
  }

  return { ok: true };
}
