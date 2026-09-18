import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { CheckoutError } from "./create-order";
import {
  makeBusiness,
  makeMenuCategory,
  makeMenuItem,
  makeCart,
  makePromotion,
} from "@/test/factories";
import { runConcurrently, partitionSettled, waitForLockWaitOn } from "@/test/concurrency";
import { checkout, defaultGuest as guest } from "@/test/checkout";
import { testSchema } from "@/test/db";
import { businessLocalDateParts, businessLocalMinutesOfDay, dayOfWeekFor } from "@/lib/reservations/availability";
import { buildSalesSummary, type ReportOrderRow } from "@/lib/reports/aggregate";

// UTC everywhere below so day-of-week/time-of-day math doesn't depend on
// where the test runner's clock happens to sit relative to a DST boundary.
const TZ = "UTC";

function today() {
  return businessLocalDateParts(new Date(), TZ);
}

describe("createOrderFromCart — promotion discount types", () => {
  it("applies an automatic percentage discount to the whole order", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "100.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });
    await makePromotion(business.id, { type: "PERCENTAGE", value: "10", code: null });

    const order = await checkout(cart, business);

    expect(order.subtotal.toString()).toBe("100");
    expect(order.discountTotal.toString()).toBe("10");
    expect(order.total.toString()).toBe("90");
    const orderPromo = await prisma.orderPromotion.findFirstOrThrow({ where: { orderId: order.id } });
    expect(orderPromo.discountAmount.toString()).toBe("10");
    expect(orderPromo.codeSnapshot).toBeNull();
  });

  it("applies a fixed-amount discount when the guest enters a matching code, case-insensitively", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "50.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });
    await makePromotion(business.id, { type: "FIXED_AMOUNT", value: "15.00", code: "SAVE15" });

    const order = await checkout(cart, business, { ...guest, promoCode: "save15" });

    expect(order.discountTotal.toString()).toBe("15");
    expect(order.total.toString()).toBe("35");
    const orderPromo = await prisma.orderPromotion.findFirstOrThrow({ where: { orderId: order.id } });
    expect(orderPromo.codeSnapshot).toBe("SAVE15");
  });

  it("collapses the scoped lines to a flat bundle price", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const itemA = await makeMenuItem(business.id, category.id, { basePrice: "20.00" });
    const itemB = await makeMenuItem(business.id, category.id, { basePrice: "20.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: itemA.id, quantity: 1 } });
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: itemB.id, quantity: 1 } });
    await makePromotion(business.id, {
      type: "BUNDLE_PRICE",
      value: "30.00",
      code: null,
      menuItems: { create: [{ menuItemId: itemA.id }, { menuItemId: itemB.id }] },
    });

    const order = await checkout(cart, business);

    expect(order.subtotal.toString()).toBe("40");
    expect(order.discountTotal.toString()).toBe("10");
    expect(order.total.toString()).toBe("30");
  });

  it("gives away the cheapest matching item for a FREE_ITEM promotion", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const cheap = await makeMenuItem(business.id, category.id, { basePrice: "15.00" });
    const pricey = await makeMenuItem(business.id, category.id, { basePrice: "25.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: cheap.id, quantity: 1 } });
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: pricey.id, quantity: 1 } });
    await makePromotion(business.id, {
      type: "FREE_ITEM",
      value: "0",
      code: null,
      menuItems: { create: [{ menuItemId: cheap.id }, { menuItemId: pricey.id }] },
    });

    const order = await checkout(cart, business);

    expect(order.subtotal.toString()).toBe("40");
    expect(order.discountTotal.toString()).toBe("15");
    expect(order.total.toString()).toBe("25");
  });

  it("taxes the discounted base, not the original subtotal", async () => {
    const business = await makeBusiness({ timezone: TZ, taxRate: "0.16" });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "100.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });
    await makePromotion(business.id, { type: "PERCENTAGE", value: "50", code: null });

    const order = await checkout(cart, business);

    expect(order.subtotal.toString()).toBe("100");
    expect(order.discountTotal.toString()).toBe("50");
    // 16% of the discounted 50, not of the original 100.
    expect(order.taxTotal.toString()).toBe("8");
    expect(order.total.toString()).toBe("58");
  });
});

describe("createOrderFromCart — promotion validity rules", () => {
  async function cartWithOneItem(business: { id: string }, price = "100.00") {
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: price });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });
    return { cart, item };
  }

  it("rejects a code for a deactivated promotion", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const { cart } = await cartWithOneItem(business);
    await makePromotion(business.id, { code: "OFF", isActive: false });

    await expect(checkout(cart, business, { ...guest, promoCode: "OFF" })).rejects.toMatchObject({
      code: "invalid_promo_code",
      promoReason: "not_active",
    });
  });

  it("rejects a code for a promotion that hasn't started yet", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const { cart } = await cartWithOneItem(business);
    await makePromotion(business.id, {
      code: "SOON",
      startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    await expect(checkout(cart, business, { ...guest, promoCode: "SOON" })).rejects.toMatchObject({
      code: "invalid_promo_code",
      promoReason: "not_yet_active",
    });
  });

  it("rejects a code for an expired promotion", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const { cart } = await cartWithOneItem(business);
    await makePromotion(business.id, {
      code: "OLD",
      endsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });

    await expect(checkout(cart, business, { ...guest, promoCode: "OLD" })).rejects.toMatchObject({
      code: "invalid_promo_code",
      promoReason: "expired",
    });
  });

  it("rejects a code that doesn't run on today's day of the week", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const { cart } = await cartWithOneItem(business);
    const wrongDay = (dayOfWeekFor(today()) + 1) % 7;
    await makePromotion(business.id, { code: "WEEKEND", daysOfWeek: [wrongDay] });

    await expect(checkout(cart, business, { ...guest, promoCode: "WEEKEND" })).rejects.toMatchObject({
      code: "invalid_promo_code",
      promoReason: "wrong_day",
    });
  });

  it("rejects a code outside its happy-hour window", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const { cart } = await cartWithOneItem(business);
    const nowMinute = businessLocalMinutesOfDay(new Date(), TZ);
    // A tight 2-minute window centered 6 hours away from right now — never
    // overlaps the moment this test actually runs.
    const start = (nowMinute + 6 * 60) % (24 * 60);
    const end = (start + 2) % (24 * 60);
    await makePromotion(business.id, { code: "HAPPYHOUR", startMinute: start, endMinute: end });

    await expect(checkout(cart, business, { ...guest, promoCode: "HAPPYHOUR" })).rejects.toMatchObject({
      code: "invalid_promo_code",
      promoReason: "wrong_time",
    });
  });

  it("rejects a code scoped to a different order type", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const { cart } = await cartWithOneItem(business); // default cart.orderType is TAKEAWAY
    await makePromotion(business.id, { code: "DINEIN", appliesToOrderType: "DINE_IN" });

    await expect(checkout(cart, business, { ...guest, promoCode: "DINEIN" })).rejects.toMatchObject({
      code: "invalid_promo_code",
      promoReason: "wrong_order_type",
    });
  });

  it("rejects a code when the order doesn't meet the minimum total", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const { cart } = await cartWithOneItem(business, "10.00");
    await makePromotion(business.id, { code: "BIGORDER", minOrderTotal: "50.00" });

    await expect(checkout(cart, business, { ...guest, promoCode: "BIGORDER" })).rejects.toMatchObject({
      code: "invalid_promo_code",
      promoReason: "min_order_not_met",
    });
  });

  it("rejects a code scoped to a dish that isn't in the cart", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const { cart } = await cartWithOneItem(business);
    const category = await makeMenuCategory(business.id);
    const otherDish = await makeMenuItem(business.id, category.id);
    await makePromotion(business.id, {
      code: "ONLYOTHER",
      menuItems: { create: [{ menuItemId: otherDish.id }] },
    });

    await expect(checkout(cart, business, { ...guest, promoCode: "ONLYOTHER" })).rejects.toMatchObject({
      code: "invalid_promo_code",
      promoReason: "no_matching_items",
    });
  });

  it("rejects a code that doesn't exist for this business", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const { cart } = await cartWithOneItem(business);

    await expect(checkout(cart, business, { ...guest, promoCode: "NOPE" })).rejects.toMatchObject({
      code: "invalid_promo_code",
      promoReason: "not_found",
    });
  });
});

describe("createOrderFromCart — promotion usage limits", () => {
  it("rejects a code that already hit its global usage limit", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "20.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });
    await makePromotion(business.id, { code: "ONEUSE", usageLimit: 1, usageCount: 1 });

    await expect(checkout(cart, business, { ...guest, promoCode: "ONEUSE" })).rejects.toMatchObject({
      code: "invalid_promo_code",
      promoReason: "usage_limit_reached",
    });
  });

  it("never enforces perUserLimit for a guest checkout — no account to count against", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "20.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });
    await makePromotion(business.id, { type: "PERCENTAGE", value: "10", code: null, perUserLimit: 1 });

    const order = await checkout(cart, business);

    expect(order.discountTotal.toString()).toBe("2");
  });

  it("flags the promotions cache as stale only when a capped promotion was redeemed", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "100.00" });
    await makePromotion(business.id, { code: "CAPPED", usageLimit: 5 });
    await makePromotion(business.id, { code: "OPEN" });

    const cappedCart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cappedCart.id, menuItemId: item.id, quantity: 1 } });
    const capped = await checkout(cappedCart, business, { ...guest, promoCode: "CAPPED" });
    expect(capped.publicCacheStale.promotions).toBe(true);

    const openCart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: openCart.id, menuItemId: item.id, quantity: 1 } });
    const uncapped = await checkout(openCart, business, { ...guest, promoCode: "OPEN" });
    expect(uncapped.publicCacheStale.promotions).toBe(false);
  });

  it("two concurrent orders redeeming a usageLimit:1 promotion — only one succeeds", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "20.00" });
    const cartA = await makeCart(business.id);
    const cartB = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cartA.id, menuItemId: item.id, quantity: 1 } });
    await prisma.cartItem.create({ data: { cartId: cartB.id, menuItemId: item.id, quantity: 1 } });
    const promo = await makePromotion(business.id, { code: "LASTONE", usageLimit: 1 });

    const results = await runConcurrently([
      () => checkout(cartA, business, { ...guest, promoCode: "LASTONE" }),
      () => checkout(cartB, business, { ...guest, promoCode: "LASTONE" }),
    ]);
    const { fulfilled, rejected } = partitionSettled(results);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // Which specific error the loser gets depends on how the two
    // transactions actually interleaved: if its own read of usageCount ran
    // before the winner committed, it passes eligibility and only the
    // atomic increment guard at the end catches it ("promotion_exhausted");
    // if its read ran after the winner committed, it's rejected earlier by
    // the eligibility check itself ("invalid_promo_code" / usage_limit_reached).
    // Both are correct — neither ever double-redeems the promotion — so
    // either is an acceptable outcome here; the real invariants are below.
    const loserError = rejected[0] as CheckoutError;
    expect(["promotion_exhausted", "invalid_promo_code"]).toContain(loserError.code);
    if (loserError.code === "invalid_promo_code") {
      expect(loserError.promoReason).toBe("usage_limit_reached");
    }

    const final = await prisma.promotion.findUniqueOrThrow({ where: { id: promo.id } });
    expect(final.usageCount).toBe(1);
    const orderPromoCount = await prisma.orderPromotion.count({ where: { promotionId: promo.id } });
    expect(orderPromoCount).toBe(1);
  });

  it("two concurrent orders racing an AUTOMATIC usageLimit:1 promotion — both orders still succeed, only one gets the discount", async () => {
    // Unlike a guest-entered code, losing this race isn't something either
    // guest did — an automatic promotion re-applies on every checkout
    // attempt for this business, so aborting the whole order over it would
    // leave the loser stuck retrying an order that can never place. The
    // fix: the loser's checkout must still succeed, just without this one
    // discount, exactly as if the promotion had never been eligible.
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "20.00" });
    const cartA = await makeCart(business.id);
    const cartB = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cartA.id, menuItemId: item.id, quantity: 1 } });
    await prisma.cartItem.create({ data: { cartId: cartB.id, menuItemId: item.id, quantity: 1 } });
    const promo = await makePromotion(business.id, {
      type: "PERCENTAGE",
      value: "10",
      code: null,
      usageLimit: 1,
    });

    const results = await runConcurrently([() => checkout(cartA, business), () => checkout(cartB, business)]);
    const { fulfilled, rejected } = partitionSettled(results);

    expect(rejected).toHaveLength(0);
    expect(fulfilled).toHaveLength(2);
    const discountedCount = fulfilled.filter((o) => o.discountTotal.toString() !== "0").length;
    expect(discountedCount).toBe(1);

    const final = await prisma.promotion.findUniqueOrThrow({ where: { id: promo.id } });
    expect(final.usageCount).toBe(1);
    const orderPromoCount = await prisma.orderPromotion.count({ where: { promotionId: promo.id } });
    expect(orderPromoCount).toBe(1);
  });

  // The two tests above race two equivalent checkouts against each other —
  // realistic, but which of the two defenses (the eligibility check's own
  // stale-read rejection, or the atomic usageCount guard) actually catches
  // the loser depends on how far each transaction happened to get before
  // the other committed. In practice `business.update`'s row lock earlier
  // in checkout fully serializes the two before either reaches the
  // promotion step, so the eligibility check reliably wins that race and
  // the atomic guard's own branch below never fires. These two tests force
  // the atomic guard specifically: a real, uncommitted transaction holds
  // the promotion's row lock after already claiming its only slot, which
  // is invisible to the checkout's own eligibility read (MVCC) but blocks
  // its guarded UPDATE outright — deterministically exercising the guard
  // itself rather than hoping for a lucky interleaving.
  it("an automatic promotion's slot claimed mid-flight by another transaction is dropped, not aborted", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "20.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });
    const promo = await makePromotion(business.id, {
      type: "PERCENTAGE",
      value: "10",
      code: null,
      usageLimit: 1,
    });

    let releaseBlocker!: () => void;
    const blockerCanCommit = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const blockerTx = prisma.$transaction(async (tx) => {
      await tx.promotion.update({ where: { id: promo.id }, data: { usageCount: { increment: 1 } } });
      await blockerCanCommit;
    });

    const checkoutPromise = checkout(cart, business);
    await waitForLockWaitOn(prisma, testSchema, "Promotion");
    releaseBlocker();
    await blockerTx;

    const order = await checkoutPromise;
    expect(order.discountTotal.toString()).toBe("0");
    const final = await prisma.promotion.findUniqueOrThrow({ where: { id: promo.id } });
    expect(final.usageCount).toBe(1);
    const orderPromoCount = await prisma.orderPromotion.count({ where: { promotionId: promo.id } });
    expect(orderPromoCount).toBe(0);
  });

  it("a guest-entered code's slot claimed mid-flight by another transaction rejects with promotion_exhausted", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "20.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });
    const promo = await makePromotion(business.id, { code: "RACE", usageLimit: 1 });

    let releaseBlocker!: () => void;
    const blockerCanCommit = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const blockerTx = prisma.$transaction(async (tx) => {
      await tx.promotion.update({ where: { id: promo.id }, data: { usageCount: { increment: 1 } } });
      await blockerCanCommit;
    });

    const checkoutPromise = checkout(cart, business, { ...guest, promoCode: "RACE" });
    await waitForLockWaitOn(prisma, testSchema, "Promotion");
    releaseBlocker();
    await blockerTx;

    await expect(checkoutPromise).rejects.toMatchObject({ code: "promotion_exhausted" });
    const final = await prisma.promotion.findUniqueOrThrow({ where: { id: promo.id } });
    expect(final.usageCount).toBe(1);
  });
});

describe("createOrderFromCart — combining several promotions", () => {
  it("sums an automatic discount and a coupon code on the same order", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "100.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });
    await makePromotion(business.id, { type: "PERCENTAGE", value: "10", code: null });
    await makePromotion(business.id, { type: "FIXED_AMOUNT", value: "5.00", code: "EXTRA5" });

    const order = await checkout(cart, business, { ...guest, promoCode: "EXTRA5" });

    expect(order.discountTotal.toString()).toBe("15");
    expect(order.total.toString()).toBe("85");
    const orderPromos = await prisma.orderPromotion.findMany({ where: { orderId: order.id } });
    expect(orderPromos).toHaveLength(2);
    expect(orderPromos.map((p) => p.discountAmount.toString()).sort()).toEqual(["10", "5"]);
  });
});

describe("createOrderFromCart — confirmation email", () => {
  it("includes the discount line when the order actually redeemed a promotion", async () => {
    const business = await makeBusiness({ timezone: TZ });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "50.00" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });
    await makePromotion(business.id, { type: "PERCENTAGE", value: "20", code: null });

    const order = await checkout(cart, business, { ...guest, guestEmail: "ana@example.com" });

    const job = await prisma.notificationJob.findFirstOrThrow({ where: { relatedOrderId: order.id } });
    const payload = job.payload as { discountTotal?: string };
    expect(payload.discountTotal).toBeDefined();
  });
});

describe("createOrderFromCart — sales report reconciliation with a discounted order", () => {
  it("reconciles module-12's sales summary to the centavo against a discounted order's frozen total", async () => {
    const business = await makeBusiness({ timezone: TZ, taxRate: "0.16" });
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id, { basePrice: "99.99" });
    const cart = await makeCart(business.id);
    await prisma.cartItem.create({ data: { cartId: cart.id, menuItemId: item.id, quantity: 1 } });
    await makePromotion(business.id, { type: "PERCENTAGE", value: "25", code: null });

    const order = await checkout(cart, business);
    // Simulate the cash payment actually being collected, same as the
    // register-close flow would — a PENDING payment isn't a sale yet.
    await prisma.payment.updateMany({ where: { orderId: order.id }, data: { status: "SUCCEEDED" } });

    const persisted = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        status: true,
        type: true,
        placedAt: true,
        staffId: true,
        cancellationReason: true,
        items: { select: { menuItemId: true, nameSnapshot: true, quantity: true, lineTotal: true } },
        payments: { select: { status: true, amount: true, provider: true, collectedByUserId: true } },
      },
    });
    const row: ReportOrderRow = {
      ...persisted,
      staffName: null,
      cancelledByName: null,
    };

    const summary = buildSalesSummary([row], []);

    // 99.99 * 0.25 = 24.9975 -> rounds to a 25.00 discount, leaving a 74.99
    // taxable base; 16% of that is 11.9984 -> 12.00; total 86.99. The report
    // must sum exactly that frozen total, not a figure recomputed from the
    // undiscounted subtotal.
    expect(order.total.toString()).toBe("86.99");
    expect(summary.grossSales.toString()).toBe(order.total.toString());
    expect(summary.netSales.toString()).toBe(order.total.toString());
    expect(summary.orderCount).toBe(1);
    expect(summary.averageTicket.toString()).toBe(order.total.toString());
  });
});
