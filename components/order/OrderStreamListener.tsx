"use client";

import { useRouter } from "next/navigation";
import { useEventStream } from "@/lib/realtime/useEventStream";

/**
 * Invisible — mounted purely for the side effect of refreshing the page
 * when this order's status changes server-side. No visible "offline"
 * chrome here on purpose: a guest doesn't need connection diagnostics,
 * they need the status to update when it can and to just work again once
 * the connection comes back (useEventStream keeps retrying on its own).
 */
export function OrderStreamListener({ publicToken }: { publicToken: string }) {
  const router = useRouter();
  useEventStream(`/api/orders/stream?token=${encodeURIComponent(publicToken)}`, () => router.refresh());
  return null;
}
