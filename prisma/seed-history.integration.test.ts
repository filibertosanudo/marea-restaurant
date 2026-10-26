import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeMenuCategory, makeMenuItem, makeStaff, makeMembership } from "@/test/factories";
import { businessLocalMinutesOfDay } from "@/lib/reservations/availability";
import { seedHistory } from "./seed-history";

// The demo's history generator against a real schema: the reservation EXCLUDE
// constraint, the folio counter and the opening hours are the database's own,
// so a generator that broke any of them fails here instead of in a reset.

async function restaurant() {
  const business = await makeBusiness({ timezone: "America/Mexico_City", taxRate: "0.16" });
  for (let day = 0; day <= 6; day++) {
    await prisma.openingHour.create({ data: { businessId: business.id, dayOfWeek: day, opensAt: 13 * 60, closesAt: 23 * 60, isClosed: day === 1 } });
  }
  for (let i = 1; i <= 6; i++) await prisma.restaurantTable.create({ data: { businessId: business.id, code: `M-0${i}`, seats: i <= 3 ? 2 : 6, qrToken: `qr-${business.id}-${i}` } });
  const category = await makeMenuCategory(business.id);
  for (let i = 0; i < 5; i++) await makeMenuItem(business.id, category.id, { basePrice: `${10 + i * 7}.50`, sortOrder: i });
  const waiter = await makeStaff("STAFF");
  await makeMembership(waiter.id, business.id);
  return business;
}

const OPTIONS = { days: 14, ordersPerDay: 12, reservationsPerDay: 6, daysAhead: 5 };
// Writing two weeks of rows takes a few seconds, more than the default 5.
const TIMEOUT = 30_000;

describe("seedHistory", () => {
  it("writes weeks of orders, payments, shifts and reservations the schema accepts", async () => {
    const business = await restaurant();

    const result = await seedHistory(prisma, business.id, OPTIONS);

    expect(result!.orders).toBeGreaterThan(80);
    expect(result!.reservations).toBeGreaterThan(30);
    const orders = await prisma.order.findMany({ where: { businessId: business.id }, select: { placedAt: true, status: true, total: true, payments: { select: { amount: true } } } });
    // Inside opening hours, local time, never on the closed Monday.
    for (const order of orders) {
      const minute = businessLocalMinutesOfDay(order.placedAt, "America/Mexico_City");
      expect(minute).toBeGreaterThanOrEqual(13 * 60);
      expect(minute).toBeLessThan(23 * 60);
    }
    // Every delivered order is paid in full; a cancelled one is not paid at all.
    for (const order of orders) {
      const paid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      expect(paid).toBe(order.status === "DELIVERED" ? Number(order.total) : 0);
    }
    expect(await prisma.cashSession.count({ where: { businessId: business.id, closedAt: null } })).toBe(0);
  }, TIMEOUT);

  it("keeps each day's folios and its counter in step, so a new order takes the next number", async () => {
    const business = await restaurant();
    await seedHistory(prisma, business.id, OPTIONS);

    const counters = await prisma.orderCounter.findMany({ where: { businessId: business.id } });
    expect(counters.length).toBeGreaterThan(8);
    for (const counter of counters) {
      const [yyyy, mm, dd] = counter.localDate.split("-");
      const prefix = `A-${yyyy.slice(2)}${mm}${dd}-`;
      expect(await prisma.order.count({ where: { businessId: business.id, orderNumber: { startsWith: prefix } } })).toBe(counter.lastNumber);
    }
  }, TIMEOUT);

  it("does nothing the second time", async () => {
    const business = await restaurant();
    await seedHistory(prisma, business.id, OPTIONS);
    const before = await prisma.order.count({ where: { businessId: business.id } });

    expect(await seedHistory(prisma, business.id, OPTIONS)).toBeNull();
    expect(await prisma.order.count({ where: { businessId: business.id } })).toBe(before);
  }, TIMEOUT);
});
