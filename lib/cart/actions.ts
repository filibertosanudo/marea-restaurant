"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/business";
import { getPublicMenuItemRaw } from "@/lib/menu/queries";
import { toPublicModifierGroup } from "@/lib/menu/public-menu";
import { getTableById } from "@/lib/tables/queries";
import { validateModifierSelection } from "@/lib/cart/modifier-validation";
import { getOrCreateCartForMutation, getCartItemForMutation } from "@/lib/cart/queries";
import { setTableIdCookie } from "@/lib/cart/cookie";
import { addToCartSchema, updateCartItemQuantitySchema } from "@/lib/cart/schemas";
import { getClientIp, isScopeRateLimited, recordScopeAttempt } from "@/lib/auth/rate-limit";
import type { Lang } from "@/lib/i18n/lang";

// One shared scope across add/update/remove: a guest bypassing a limit on
// one by hammering another would defeat the point of having it at all.
const MUTATE_SCOPE = "cart:mutate";
const MUTATE_MAX_ATTEMPTS = 60;
const MUTATE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Called client-side on mount by /t/[qrToken] right after it renders — a
 * Server Component page can't write cookies itself, only a Server Action or
 * Route Handler can. Re-validates the table (active, in this business)
 * instead of trusting the id blindly, since a Server Action is a public
 * endpoint a client could call with an arbitrary id.
 */
export async function setTableCookieAction(tableId: string) {
  const business = await getCurrentBusiness();
  const table = await getTableById(business.id, tableId);
  if (!table) return;
  await setTableIdCookie(table.id);
}

export type AddToCartState = { error?: string } | { success: true } | undefined;

/**
 * The only place a dish and its modifiers move from "what the client asked
 * for" to "what actually gets added" — everything here is re-read from the
 * catalog. The client sends menuItemId + optionIds + quantity, nothing else
 * is trusted (price, availability, which groups apply).
 */
export async function addToCartAction(
  lang: Lang,
  _prevState: AddToCartState,
  formData: FormData
): Promise<AddToCartState> {
  const parsed = addToCartSchema.safeParse({
    menuItemId: formData.get("menuItemId"),
    quantity: formData.get("quantity"),
    optionIds: formData.getAll("optionIds"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: "invalid_input" };

  const ip = getClientIp(await headers());
  if (await isScopeRateLimited(MUTATE_SCOPE, ip, MUTATE_MAX_ATTEMPTS, MUTATE_WINDOW_MS)) {
    return { error: "rate_limited" };
  }

  const business = await getCurrentBusiness();
  const item = await getPublicMenuItemRaw(business.id, parsed.data.menuItemId);
  if (!item || !item.isAvailable) {
    return { error: "item_unavailable" };
  }

  const groups = item.modifierGroups.map((mg) => toPublicModifierGroup(mg.group, lang));
  const validation = validateModifierSelection(groups, parsed.data.optionIds);
  if (!validation.ok) {
    return { error: validation.error };
  }

  const cart = await getOrCreateCartForMutation(business.id);

  await prisma.$transaction(async (tx) => {
    const cartItem = await tx.cartItem.create({
      data: {
        cartId: cart.id,
        menuItemId: item.id,
        quantity: parsed.data.quantity,
        notes: parsed.data.notes ?? null,
      },
    });
    if (parsed.data.optionIds.length > 0) {
      await tx.cartItemModifier.createMany({
        data: parsed.data.optionIds.map((optionId) => ({
          cartItemId: cartItem.id,
          modifierOptionId: optionId,
        })),
      });
    }
  });

  await recordScopeAttempt(MUTATE_SCOPE, ip);
  revalidatePath("/menu");
  return { success: true };
}

export async function updateCartItemQuantityAction(cartItemId: string, quantity: number) {
  const parsed = updateCartItemQuantitySchema.safeParse({ cartItemId, quantity });
  if (!parsed.success) return;

  const ip = getClientIp(await headers());
  if (await isScopeRateLimited(MUTATE_SCOPE, ip, MUTATE_MAX_ATTEMPTS, MUTATE_WINDOW_MS)) return;

  const business = await getCurrentBusiness();
  const cart = await getOrCreateCartForMutation(business.id);
  const existing = await getCartItemForMutation(cart.id, parsed.data.cartItemId);
  if (!existing) return;

  if (parsed.data.quantity === 0) {
    await prisma.cartItem.delete({ where: { id: existing.id } });
  } else {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: parsed.data.quantity },
    });
  }

  await recordScopeAttempt(MUTATE_SCOPE, ip);
  revalidatePath("/menu");
}

export async function removeCartItemAction(cartItemId: string) {
  const ip = getClientIp(await headers());
  if (await isScopeRateLimited(MUTATE_SCOPE, ip, MUTATE_MAX_ATTEMPTS, MUTATE_WINDOW_MS)) return;

  const business = await getCurrentBusiness();
  const cart = await getOrCreateCartForMutation(business.id);
  const existing = await getCartItemForMutation(cart.id, cartItemId);
  if (!existing) return;

  await prisma.cartItem.delete({ where: { id: existing.id } });
  await recordScopeAttempt(MUTATE_SCOPE, ip);
  revalidatePath("/menu");
}
