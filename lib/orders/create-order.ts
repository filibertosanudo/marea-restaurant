import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Lang } from "@/lib/i18n/lang";
import { getCartSessionToken } from "@/lib/cart/cookie";
import { pickTranslation } from "@/lib/i18n/translations";

export class CheckoutError extends Error {
  code: "empty_cart" | "item_unavailable" | "modifier_unavailable";
  dishName?: string;
  constructor(code: CheckoutError["code"], dishName?: string) {
    super(code);
    this.code = code;
    this.dishName = dishName;
  }
}

type GuestInfo = {
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  notes?: string;
};

/**
 * The one place a cart becomes an order. Everything happens inside a single
 * transaction: re-reading the catalog, freezing the snapshot, minting the
 * folio, and enqueueing the confirmation notification. If any step throws
 * (an item sold out mid-checkout, for instance), Postgres rolls the whole
 * thing back — there's never a folio issued for an order that didn't fully
 * commit, and never a half-priced OrderItem.
 */
export async function createOrderFromCart(businessId: string, lang: Lang, guest: GuestInfo) {
  const token = await getCartSessionToken();
  if (!token) throw new CheckoutError("empty_cart");

  const order = await prisma.$transaction(async (tx) => {
    // Lock the Cart row before reading anything else it owns. Without this,
    // two overlapping checkout submissions (a double-tap before the button's
    // disabled state lands, two open tabs) each read the same CartItems,
    // each pass availability, and each commit a full duplicate order —
    // nothing here would throw, since the cart isn't actually consumed
    // until cartItem.deleteMany at the very end. FOR UPDATE makes the
    // second transaction block until the first commits, so it re-reads a
    // cart the first one already emptied and takes the empty_cart path
    // below instead of creating a second order for the same items.
    const lockedCart = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Cart" WHERE "sessionToken" = ${token} AND "businessId" = ${businessId} FOR UPDATE
    `;
    const cartId = lockedCart[0]?.id;
    if (!cartId) throw new CheckoutError("empty_cart");

    const cart = await tx.cart.findUniqueOrThrow({
      where: { id: cartId },
      include: {
        items: {
          include: {
            menuItem: {
              include: { translations: true, category: true },
            },
            modifiers: {
              include: { option: { include: { translations: true } } },
            },
          },
        },
      },
    });

    if (cart.items.length === 0) {
      throw new CheckoutError("empty_cart");
    }

    const lineInputs = cart.items.map((item) => {
      const dishAvailable =
        item.menuItem.isAvailable &&
        item.menuItem.deletedAt === null &&
        item.menuItem.category.isActive &&
        item.menuItem.category.deletedAt === null;

      const dishName = pickTranslation(item.menuItem.translations, lang)?.name ?? item.menuItem.slug;

      if (!dishAvailable) {
        throw new CheckoutError("item_unavailable", dishName);
      }

      const unavailableModifier = item.modifiers.find((m) => !m.option.isAvailable);
      if (unavailableModifier) {
        throw new CheckoutError("modifier_unavailable", dishName);
      }

      const unitPrice = item.modifiers
        .reduce((sum, m) => sum.add(m.option.priceDelta), item.menuItem.basePrice)
        .toDecimalPlaces(2);
      const lineTotal = unitPrice.mul(item.quantity).toDecimalPlaces(2);

      return {
        menuItemId: item.menuItem.id,
        nameSnapshot: dishName,
        unitPrice,
        quantity: item.quantity,
        lineTotal,
        notes: item.notes,
        modifiers: item.modifiers.map((m) => ({
          modifierOptionId: m.option.id,
          nameSnapshot: pickTranslation(m.option.translations, lang)?.name ?? m.option.slug,
          priceDelta: m.option.priceDelta,
        })),
      };
    });

    const subtotal = lineInputs
      .reduce((sum, l) => sum.add(l.lineTotal), new Prisma.Decimal(0))
      .toDecimalPlaces(2);

    const business = await tx.business.update({
      where: { id: businessId },
      data: { orderSequence: { increment: 1 } },
      select: { orderSequence: true, taxRate: true, currency: true },
    });

    const taxTotal = subtotal.mul(business.taxRate).toDecimalPlaces(2);
    const total = subtotal.add(taxTotal).toDecimalPlaces(2);
    const orderNumber = `A-${String(business.orderSequence).padStart(4, "0")}`;

    const createdOrder = await tx.order.create({
      data: {
        businessId,
        orderNumber,
        type: cart.orderType,
        tableId: cart.tableId,
        guestName: guest.guestName,
        guestPhone: guest.guestPhone,
        guestEmail: guest.guestEmail,
        notes: guest.notes,
        subtotal,
        taxTotal,
        total,
        currency: business.currency,
        items: {
          create: lineInputs.map((l) => ({
            menuItemId: l.menuItemId,
            nameSnapshot: l.nameSnapshot,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
            notes: l.notes,
            modifiers: { create: l.modifiers },
          })),
        },
        statusEvents: {
          create: { toStatus: "PENDING" },
        },
        payments: {
          create: {
            businessId,
            provider: "CASH_REGISTER",
            status: "PENDING",
            amount: total,
            currency: business.currency,
          },
        },
      },
    });

    if (guest.guestEmail) {
      await tx.notificationJob.create({
        data: {
          businessId,
          channel: "EMAIL",
          templateKey: "order.confirmed",
          recipientEmail: guest.guestEmail,
          locale: lang,
          payload: { orderNumber: createdOrder.orderNumber, publicToken: createdOrder.publicToken },
          relatedOrderId: createdOrder.id,
          dedupeKey: `order:${createdOrder.id}:PENDING`,
        },
      });
    }

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    return createdOrder;
  });

  return order;
}
