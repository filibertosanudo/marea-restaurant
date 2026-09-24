"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPublicBusiness } from "@/lib/business";
import { invalidatePublicCache } from "@/lib/cache/public";
import { createOrderFromCart, CheckoutError } from "@/lib/orders/create-order";
import { checkoutSchema } from "@/lib/orders/schemas";
import { getClientIp, isScopeRateLimited, recordScopeAttempt } from "@/lib/auth/rate-limit";
import type { Lang } from "@/lib/i18n/lang";
import type { PromotionRejectionReason } from "@/lib/promotions/engine";

const CREATE_SCOPE = "order:create";
const CREATE_MAX_ATTEMPTS = 5;
const CREATE_WINDOW_MS = 15 * 60 * 1000;

export type CheckoutState =
  | { error: "invalid_input"; fieldErrors: Record<string, string> }
  | { error: "invalid_promo_code"; promoReason?: PromotionRejectionReason }
  | {
      error:
        | "empty_cart"
        | "item_unavailable"
        | "modifier_unavailable"
        | "modifier_invalid"
        | "promotion_exhausted"
        | "rate_limited";
      dishName?: string;
    }
  | undefined;

export async function createOrderAction(
  lang: Lang,
  _prevState: CheckoutState,
  formData: FormData
): Promise<CheckoutState> {
  const parsed = checkoutSchema.safeParse({
    guestName: formData.get("guestName"),
    guestPhone: formData.get("guestPhone"),
    guestEmail: formData.get("guestEmail") ?? "",
    notes: formData.get("notes") || undefined,
    promoCode: formData.get("promoCode") || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[issue.path.join(".")] = issue.code;
    return { error: "invalid_input", fieldErrors };
  }

  const ip = getClientIp(await headers());
  if (await isScopeRateLimited(CREATE_SCOPE, ip, CREATE_MAX_ATTEMPTS, CREATE_WINDOW_MS)) {
    return { error: "rate_limited" };
  }

  const business = await getPublicBusiness();

  let order;
  try {
    order = await createOrderFromCart(business.id, lang, parsed.data);
  } catch (err) {
    if (err instanceof CheckoutError) {
      if (err.code === "invalid_promo_code") {
        return { error: err.code, promoReason: err.promoReason };
      }
      return { error: err.code, dishName: err.dishName };
    }
    throw err;
  }

  // Read by the public menu and landing: tell the cache only when this
  // order actually changed what they show (a dish sold out, a promotion
  // exhausted), not on every order.
  if (order.publicCacheStale.menu) invalidatePublicCache("menu", business.id);
  if (order.publicCacheStale.promotions) invalidatePublicCache("promotions", business.id);

  // Charged on success, not on every attempt — a guest who bounces off
  // item_unavailable a few times while sorting out their cart must not burn
  // their quota for an order that never actually placed.
  await recordScopeAttempt(CREATE_SCOPE, ip);
  redirect(`/o/${order.publicToken}`);
}
