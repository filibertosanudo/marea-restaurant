"use server";

import { redirect } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { createOrderFromCart, CheckoutError } from "@/lib/orders/create-order";
import { checkoutSchema } from "@/lib/orders/schemas";
import type { Lang } from "@/lib/i18n/lang";

export type CheckoutState =
  | { error: "invalid_input"; fieldErrors: Record<string, string> }
  | { error: "empty_cart" | "item_unavailable" | "modifier_unavailable"; dishName?: string }
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

  redirect(`/o/${order.publicToken}`);
}
