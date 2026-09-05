"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { createOrderFromCart, CheckoutError } from "@/lib/orders/create-order";
import { checkoutSchema } from "@/lib/orders/schemas";
import { getClientIp, isScopeRateLimited, recordScopeAttempt } from "@/lib/auth/rate-limit";
import type { Lang } from "@/lib/i18n/lang";

const CREATE_SCOPE = "order:create";
const CREATE_MAX_ATTEMPTS = 5;
const CREATE_WINDOW_MS = 15 * 60 * 1000;

export type CheckoutState =
  | { error: "invalid_input"; fieldErrors: Record<string, string> }
  | {
      error: "empty_cart" | "item_unavailable" | "modifier_unavailable" | "modifier_invalid" | "rate_limited";
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

  const business = await getCurrentBusiness();

  let order;
  try {
    order = await createOrderFromCart(business.id, lang, parsed.data);
  } catch (err) {
    if (err instanceof CheckoutError) {
      return { error: err.code, dishName: err.dishName };
    }
    throw err;
  }

  // Charged on success, not on every attempt — a guest who bounces off
  // item_unavailable a few times while sorting out their cart must not burn
  // their quota for an order that never actually placed.
  await recordScopeAttempt(CREATE_SCOPE, ip);
  redirect(`/o/${order.publicToken}`);
}
