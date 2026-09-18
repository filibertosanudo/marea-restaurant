import "server-only";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import type { Lang } from "@/lib/i18n/lang";
import { getCartSessionToken } from "@/lib/cart/cookie";
import { pickTranslation } from "@/lib/i18n/translations";
import { toPublicModifierGroup } from "@/lib/menu/public-menu";
import { validateModifierSelection } from "@/lib/cart/modifier-validation";
import { formatMoney } from "@/lib/dto/money";
import { appOrigin } from "@/lib/env";
import { enqueueKitchenTicket } from "@/lib/printing/queue";
import { buildKitchenTicketDocument } from "@/lib/printing/kitchen-ticket";
import { applyPromotions, type PromotionRejectionReason } from "@/lib/promotions/engine";
import { toPromotionRule } from "@/lib/dto/promotions";
import { nextFolio } from "@/lib/orders/folio";

export class CheckoutError extends Error {
  code:
    | "empty_cart"
    | "item_unavailable"
    | "modifier_unavailable"
    | "modifier_invalid"
    | "invalid_promo_code"
    | "promotion_exhausted";
  dishName?: string;
  /** Only set for invalid_promo_code — the specific rule the code failed, not a bare "invalid code". */
  promoReason?: PromotionRejectionReason;
  constructor(code: CheckoutError["code"], dishName?: string, promoReason?: PromotionRejectionReason) {
    super(code);
    this.code = code;
    this.dishName = dishName;
    this.promoReason = promoReason;
  }
}

export type GuestInfo = {
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  notes?: string;
  /** Entered at checkout, matched case-insensitively against a Promotion.code — see lib/promotions/engine.ts. */
  promoCode?: string;
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
        table: true,
        items: {
          include: {
            menuItem: {
              include: {
                translations: true,
                category: true,
                // Needed to re-run validateModifierSelection below — the
                // group's minSelections/maxSelections/isRequired can change
                // after an item was already sitting in someone's cart.
                modifierGroups: {
                  orderBy: { sortOrder: "asc" },
                  include: {
                    group: {
                      include: {
                        translations: true,
                        options: {
                          where: { deletedAt: null },
                          orderBy: { sortOrder: "asc" },
                          include: { translations: true },
                        },
                      },
                    },
                  },
                },
              },
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

      // Same rule addToCartAction enforces (minSelections/maxSelections/
      // isRequired), re-run here because a group's requirements can change
      // while the item is sitting in an open cart — without this, a cart
      // built before a group became required checks out with the group
      // simply missing.
      const publicGroups = item.menuItem.modifierGroups.map((mg) => toPublicModifierGroup(mg.group, lang));
      const selectedOptionIds = item.modifiers.map((m) => m.option.id);
      const modifierValidation = validateModifierSelection(publicGroups, selectedOptionIds);
      if (!modifierValidation.ok) {
        throw new CheckoutError("modifier_invalid", dishName);
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

    // Stock check + decrement, only for dishes that track inventory
    // (trackInventory false is the common case and ignores stockQuantity
    // entirely, per the schema). Aggregated per menu item first — a cart
    // can hold two lines for the same dish with different modifiers, and
    // stock belongs to the dish, not the line.
    const stockByMenuItem = new Map<string, { quantity: number; dishName: string }>();
    for (const item of cart.items) {
      if (!item.menuItem.trackInventory) continue;
      const dishName = pickTranslation(item.menuItem.translations, lang)?.name ?? item.menuItem.slug;
      const existing = stockByMenuItem.get(item.menuItem.id);
      stockByMenuItem.set(item.menuItem.id, {
        quantity: (existing?.quantity ?? 0) + item.quantity,
        dishName,
      });
    }
    for (const [menuItemId, { quantity, dishName }] of stockByMenuItem) {
      // The `stockQuantity: { gte: quantity }` guard makes this an atomic
      // check-and-decrement: if a concurrent checkout already ate the stock
      // between our read of the cart and here, this simply matches zero
      // rows instead of taking stock negative.
      const decremented = await tx.menuItem.updateMany({
        where: { id: menuItemId, businessId, stockQuantity: { gte: quantity } },
        data: { stockQuantity: { decrement: quantity } },
      });
      if (decremented.count === 0) {
        throw new CheckoutError("item_unavailable", dishName);
      }
    }
    // Only a dish that just ran out changes what the public menu shows; a
    // plain decrement doesn't, so it doesn't invalidate the menu cache.
    let menuChanged = false;
    if (stockByMenuItem.size > 0) {
      const soldOut = await tx.menuItem.updateMany({
        where: { id: { in: [...stockByMenuItem.keys()] }, businessId, stockQuantity: { lte: 0 } },
        data: { isAvailable: false },
      });
      menuChanged = soldOut.count > 0;
    }

    const subtotal = lineInputs
      .reduce((sum, l) => sum.add(l.lineTotal), new Prisma.Decimal(0))
      .toDecimalPlaces(2);

    // A plain read: no lock. The folio counter is taken later, right before
    // the order insert (see nextFolio).
    const business = await tx.business.findUniqueOrThrow({
      where: { id: businessId },
      select: { taxRate: true, currency: true, timezone: true },
    });

    // Not filtered to isActive here on purpose: an entered code matching a
    // deactivated promotion should reject with "not_active", not the more
    // opaque "not_found" a query-level filter would produce. Automatic
    // (code: null) promotions that are inactive simply fail eligibility
    // below and never enter `discounts`. Named for what it actually holds —
    // this business's whole non-deleted promotion history, not just the
    // currently-active ones.
    const businessPromotions = await tx.promotion.findMany({
      where: { businessId, deletedAt: null },
      // Every locale, not just `lang`: pickTranslation's fallback (any
      // translation beats none) needs the other locale's row on hand for a
      // promotion an admin only ever translated into one language.
      include: { menuItems: { select: { menuItemId: true } }, translations: true },
    });
    const promotionById = new Map(businessPromotions.map((p) => [p.id, p]));
    const promoResult = applyPromotions({
      lines: lineInputs.map((l) => ({
        menuItemId: l.menuItemId,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
      })),
      promotions: businessPromotions.map(toPromotionRule),
      code: guest.promoCode || undefined,
      orderType: cart.orderType,
      now: new Date(),
      timezone: business.timezone,
      usageByPromotion: Object.fromEntries(businessPromotions.map((p) => [p.id, p.usageCount])),
      // perUserUsageByPromotion omitted: every order today is a guest order
      // (no customerId is ever set), and perUserLimit only means something
      // against a real account.
    });
    if (promoResult.codeResult?.ok === false) {
      throw new CheckoutError("invalid_promo_code", undefined, promoResult.codeResult.reason);
    }

    // Redeem every discount BEFORE the order exists, mirroring where the
    // stock guard runs above: a race lost here is resolved before any
    // order-shaped row is created, never by rolling one back afterward. An
    // AUTOMATIC promotion that loses this race to another order placed in
    // the same instant isn't something this guest did — it's dropped
    // silently and checkout proceeds without it, same as a promotion that
    // was simply never eligible. A guest-entered CODE losing the race is
    // different: they explicitly asked for that one, so it surfaces as a
    // real rejection instead of a silently smaller discount they didn't ask
    // for. (Getting this backwards — aborting the whole order over an
    // automatic promotion's exhausted usageLimit — would leave the guest
    // stuck retrying an order that can never succeed, since the same
    // automatic promotion re-applies on every attempt.)
    const redeemedDiscounts: typeof promoResult.discounts = [];
    for (const discount of promoResult.discounts) {
      // Never undefined: every discount.promotionId came from applyPromotions
      // evaluating exactly this same businessPromotions array, so the id is
      // always a key in the map built from it.
      const promo = promotionById.get(discount.promotionId)!;
      const guardedWhere =
        promo.usageLimit !== null
          ? { id: promo.id, usageCount: { lt: promo.usageLimit } }
          : { id: promo.id };
      const incremented = await tx.promotion.updateMany({
        where: guardedWhere,
        data: { usageCount: { increment: 1 } },
      });
      if (incremented.count === 0) {
        const isCodeMatch =
          promoResult.codeResult?.ok === true && promoResult.codeResult.promotionId === promo.id;
        if (isCodeMatch) throw new CheckoutError("promotion_exhausted");
        continue;
      }
      redeemedDiscounts.push(discount);
    }

    const discountTotal = redeemedDiscounts
      .reduce((sum, d) => sum.add(d.amount), new Prisma.Decimal(0))
      .toDecimalPlaces(2);
    // Floored at 0, defensively: engine.ts's own overflow scaling already
    // guarantees discountTotal never exceeds the subtotal it computed from
    // these same lines, so this floor should never actually engage — it's
    // here so a negative taxable base can't happen even if that guarantee
    // and this function's own `subtotal` (computed independently, a few
    // lines up) ever drift apart.
    const taxableBase = Prisma.Decimal.max(
      subtotal.minus(discountTotal),
      new Prisma.Decimal(0)
    ).toDecimalPlaces(2);
    const taxTotal = taxableBase.mul(business.taxRate).toDecimalPlaces(2);
    const total = taxableBase.add(taxTotal).toDecimalPlaces(2);
    // Last thing before the insert on purpose: the counter row stays locked
    // until this transaction commits, so every statement that runs after
    // taking the number is time other orders of the day wait.
    const orderNumber = await nextFolio(tx, businessId, business.timezone);

    const createdOrder = await tx.order.create({
      data: {
        businessId,
        orderNumber,
        type: cart.orderType,
        tableId: cart.tableId,
        guestName: guest.guestName,
        guestPhone: guest.guestPhone,
        guestEmail: guest.guestEmail,
        locale: lang,
        notes: guest.notes,
        subtotal,
        discountTotal,
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
        // Creates the first Payment row at PENDING — outside lib/payments/
        // on purpose: that module owns *transitions* (an existing payment
        // moving from one status to another), and a brand-new row has no
        // prior state to validate against.
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

    // One ledger row per tracked dish in this order, in the same transaction
    // as the decrement above — the stock check ran before the order existed,
    // so orderId wasn't available yet to attach it there.
    if (stockByMenuItem.size > 0) {
      await tx.stockMovement.createMany({
        data: [...stockByMenuItem.entries()].map(([menuItemId, { quantity }]) => ({
          menuItemId,
          delta: -quantity,
          reason: "SALE",
          orderId: createdOrder.id,
        })),
      });
    }

    if (redeemedDiscounts.length > 0) {
      // The usageCount increments already happened above, before the order
      // existed — this only freezes the audit trail (which promotions, and
      // for how much) now that there's an orderId to attach it to.
      await tx.orderPromotion.createMany({
        data: redeemedDiscounts.map((d) => {
          const promo = promotionById.get(d.promotionId)!;
          const isCodeMatch =
            promoResult.codeResult?.ok === true && promoResult.codeResult.promotionId === promo.id;
          return {
            orderId: createdOrder.id,
            promotionId: promo.id,
            codeSnapshot: isCodeMatch ? promo.code : null,
            titleSnapshot: pickTranslation(promo.translations, lang)?.title ?? promo.slug,
            discountAmount: d.amount,
          };
        }),
      });
    }

    // Unconditional, unlike the confirmation email above: every order needs
    // a kitchen ticket, guest email or not. A printer with no paper must
    // never be a reason this transaction fails — see lib/printing/queue.ts's
    // own header comment — so this only ever enqueues, never blocks.
    await enqueueKitchenTicket(tx, {
      businessId,
      orderId: createdOrder.id,
      document: buildKitchenTicketDocument({
        orderNumber: createdOrder.orderNumber,
        tableLabel: cart.table?.code ?? null,
        guestCount: createdOrder.guestCount,
        placedAt: createdOrder.placedAt,
        timezone: business.timezone,
        lang,
        orderNote: guest.notes ?? null,
        items: lineInputs.map((l) => ({
          quantity: l.quantity,
          name: l.nameSnapshot,
          notes: l.notes ?? null,
          modifiers: l.modifiers.map((m) => m.nameSnapshot),
        })),
      }),
    });

    if (guest.guestEmail) {
      await tx.notificationJob.create({
        data: {
          businessId,
          channel: "EMAIL",
          templateKey: "order.confirmed",
          recipientEmail: guest.guestEmail,
          locale: lang,
          payload: {
            orderNumber: createdOrder.orderNumber,
            orderUrl: `${appOrigin()}/o/${createdOrder.publicToken}`,
            items: lineInputs.map((l) => ({
              name: l.nameSnapshot,
              quantity: l.quantity,
              lineTotal: formatMoney(l.lineTotal.toString(), business.currency, lang),
            })),
            discountTotal: discountTotal.greaterThan(0)
              ? formatMoney(discountTotal.toString(), business.currency, lang)
              : undefined,
            total: formatMoney(total.toString(), business.currency, lang),
            currency: business.currency,
          },
          relatedOrderId: createdOrder.id,
          dedupeKey: `order:${createdOrder.id}:PENDING`,
        },
      });
    }

    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

    // A redemption against a capped promotion can be the one that exhausts
    // it, which changes the offers the landing advertises.
    const promotionsChanged = redeemedDiscounts.some((d) => promotionById.get(d.promotionId)!.usageLimit !== null);

    return { ...createdOrder, publicCacheStale: { menu: menuChanged, promotions: promotionsChanged } };
  });

  return order;
}
