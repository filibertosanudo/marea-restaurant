// Seis semanas de vida de un restaurante, para que la demo no se vea vacía:
// pedidos ya entregados (y algunos cancelados) con sus pagos, sus cambios de
// estado y un corte de caja por día, más reservaciones pasadas, de hoy y de las
// próximas dos semanas. Sólo datos de ejemplo: nada aquí corre en producción.
//
// Determinista: el mismo negocio produce la misma historia cada vez (un
// generador con semilla, no Math.random), anclada a "hoy", así la demo se ve
// igual después de cada reinicio nocturno.
//
// Respeta las reglas del sistema en vez de rodearlas:
// - Folios diarios "A-YYMMDD-NNN" y OrderCounter al día, para que un pedido
//   nuevo de hoy tome el número siguiente.
// - Sólo dentro del horario de cada negocio y en su zona horaria.
// - Pagos con tarjeta como terminal física (CARD_TERMINAL), nunca como Stripe:
//   un pago de Stripe sin un PaymentIntent real rompería un reembolso.
// - Reservaciones activas que nunca se empalman en una mesa (la restricción
//   EXCLUDE de la base sólo deja pasar PENDING, CONFIRMED y SEATED sin choque).
import { createId } from "@paralleldrive/cuid2";
import { Prisma, type PrismaClient } from "../lib/generated/prisma/client";
import { businessLocalDateParts, businessLocalMinutesOfDay, dayOfWeekFor, localWallClockToUtc } from "../lib/reservations/availability";
import { formatFolio } from "../lib/orders/folio-format";

const DAY_MS = 24 * 60 * 60 * 1000;
const D = (value: string | number) => new Prisma.Decimal(value);

/** mulberry32: small, fast, and the same sequence for the same seed. */
function rng(seedText: string) {
  let seed = 0;
  for (const ch of seedText) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = ["Ana", "Luis", "María", "José", "Sofía", "Diego", "Valeria", "Carlos", "Fernanda", "Jorge", "Camila", "Miguel", "Daniela", "Ricardo", "Regina", "Andrés", "Paola", "Emilio", "Lucía", "Héctor", "Ximena", "Rodrigo", "Mariana", "Tomás"];
const LAST = ["García", "Hernández", "López", "Martínez", "Ramírez", "Flores", "Torres", "Rivera", "Gómez", "Díaz", "Morales", "Ortiz", "Castillo", "Vargas", "Ruiz", "Mendoza", "Aguilar", "Navarro"];
const CANCEL_REASONS = ["Customer left before it was ready", "Ordered by mistake", "Item ran out", "Duplicate order"];

export type HistoryOptions = {
  /** Days of history before today. */
  days: number;
  /** Average orders on an ordinary weekday. */
  ordersPerDay: number;
  /** Average reservations per open day; 0 for a business that takes none. */
  reservationsPerDay: number;
  /** Days of reservations ahead of today. */
  daysAhead: number;
};

type Window = { opensAt: number; closesAt: number };

/** Busier on weekends, quiet early in the week. Index = day of week, 0 = Sunday. */
const WEEKDAY_WEIGHT = [1.25, 0.6, 0.75, 0.85, 0.95, 1.35, 1.55];

export async function seedHistory(prisma: PrismaClient, businessId: string, options: HistoryOptions): Promise<{ orders: number; reservations: number } | null> {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { slug: true, timezone: true, taxRate: true, currency: true } });
  const now = new Date();
  const tz = business.timezone;
  const today = businessLocalDateParts(now, tz);
  const startOfToday = localWallClockToUtc(today.year, today.month, today.day, 0, tz);

  // Idempotent: a seed run again, or a database that already has history, gets nothing new.
  if (await prisma.order.count({ where: { businessId, placedAt: { lt: startOfToday } } })) return null;

  const random = rng(`history:${business.slug}`);
  const pick = <T,>(items: readonly T[]) => items[Math.floor(random() * items.length)];
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const name = () => `${pick(FIRST)} ${pick(LAST)}`;

  const [hours, tables, dishes, members] = await Promise.all([
    prisma.openingHour.findMany({ where: { businessId, isClosed: false }, select: { dayOfWeek: true, opensAt: true, closesAt: true } }),
    prisma.restaurantTable.findMany({ where: { businessId, isActive: true, deletedAt: null }, select: { id: true, seats: true }, orderBy: { code: "asc" } }),
    prisma.menuItem.findMany({ where: { businessId, deletedAt: null }, select: { id: true, basePrice: true, translations: { where: { locale: "en" }, select: { name: true } } }, orderBy: { sortOrder: "asc" } }),
    prisma.businessMembership.findMany({ where: { businessId, isActive: true }, select: { userId: true, role: true } }),
  ]);
  if (dishes.length === 0) return null;
  const staff = members.filter((m) => m.role === "STAFF").map((m) => m.userId);
  const admins = members.filter((m) => m.role !== "STAFF").map((m) => m.userId);
  const servers = staff.length ? staff : admins;
  const cashier = servers[0] ?? null;
  // A few dishes sell far more than the rest, as in any restaurant.
  const weights = dishes.map((_, i) => 1 / (1 + i * 0.35) + random() * 0.4);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const dish = () => {
    let r = random() * totalWeight;
    for (let i = 0; i < dishes.length; i++) if ((r -= weights[i]) <= 0) return dishes[i];
    return dishes[dishes.length - 1];
  };

  const windowsFor = (date: { year: number; month: number; day: number }): Window[] =>
    hours.filter((h) => h.dayOfWeek === dayOfWeekFor(date));
  const dayOf = (offset: number) => {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
  };

  const orders: Prisma.OrderCreateManyInput[] = [];
  const items: Prisma.OrderItemCreateManyInput[] = [];
  const events: Prisma.OrderStatusEventCreateManyInput[] = [];
  const payments: Prisma.PaymentCreateManyInput[] = [];
  const sessions: Prisma.CashSessionCreateManyInput[] = [];
  const counters: Array<{ localDate: string; lastNumber: number }> = [];
  const nowMinutes = businessLocalMinutesOfDay(now, tz);

  for (let offset = -options.days; offset <= 0; offset++) {
    const date = dayOf(offset);
    const windows = windowsFor(date);
    if (windows.length === 0) continue;
    const wanted = Math.round(options.ordersPerDay * WEEKDAY_WEIGHT[dayOfWeekFor(date)] * (0.8 + random() * 0.4));
    // Today only up to an hour ago: the live board belongs to the seeded orders.
    const latest = offset === 0 ? nowMinutes - 60 : Infinity;
    const minutes: number[] = [];
    for (let n = 0; n < wanted; n++) {
      const w = pick(windows);
      // Two peaks inside each window: its first third and its last third.
      const span = w.closesAt - w.opensAt - 30;
      const peak = random() < 0.5 ? 0.25 : 0.75;
      const at = Math.round(w.opensAt + span * Math.min(0.98, Math.max(0.02, peak + (random() - 0.5) * 0.35)));
      if (at <= latest) minutes.push(at);
    }
    minutes.sort((a, b) => a - b);
    if (minutes.length === 0) continue;

    const sessionId = createId();
    const firstOpen = Math.min(...windows.map((w) => w.opensAt));
    const lastClose = Math.max(...windows.map((w) => w.closesAt));
    let cashTotal = D(0);

    minutes.forEach((minute, index) => {
      const placedAt = localWallClockToUtc(date.year, date.month, date.day, minute, tz);
      const id = createId();
      const dineIn = tables.length > 0 && random() < 0.65;
      const table = dineIn ? pick(tables) : null;
      const lines = between(1, 4);
      let subtotal = D(0);
      for (let l = 0; l < lines; l++) {
        const d = dish();
        const quantity = random() < 0.8 ? 1 : between(2, 3);
        const lineTotal = d.basePrice.mul(quantity);
        subtotal = subtotal.add(lineTotal);
        items.push({ id: createId(), orderId: id, menuItemId: d.id, nameSnapshot: d.translations[0]?.name ?? "Dish", unitPrice: d.basePrice, quantity, lineTotal, createdAt: placedAt, updatedAt: placedAt });
      }
      const taxTotal = subtotal.mul(business.taxRate).toDecimalPlaces(2);
      const total = subtotal.add(taxTotal).toDecimalPlaces(2);
      const cancelled = random() < 0.05;
      const server = servers.length ? pick(servers) : null;
      const preparing = new Date(placedAt.getTime() + between(1, 5) * 60_000);
      const ready = new Date(preparing.getTime() + between(8, 25) * 60_000);
      const delivered = new Date(ready.getTime() + between(1, 8) * 60_000);

      orders.push({
        id,
        businessId,
        orderNumber: formatFolio(date, index + 1),
        publicToken: createId(),
        type: dineIn ? "DINE_IN" : "TAKEAWAY",
        status: cancelled ? "CANCELLED" : "DELIVERED",
        tableId: table?.id ?? null,
        staffId: server,
        guestName: name(),
        guestCount: dineIn ? between(1, Math.max(1, table?.seats ?? 2)) : null,
        locale: random() < 0.7 ? "es" : "en",
        subtotal,
        taxTotal,
        total,
        currency: business.currency,
        placedAt,
        readyAt: cancelled ? null : ready,
        completedAt: cancelled ? null : delivered,
        cancelledAt: cancelled ? preparing : null,
        cancellationReason: cancelled ? pick(CANCEL_REASONS) : null,
        createdAt: placedAt,
        updatedAt: cancelled ? preparing : delivered,
      });
      events.push({ id: createId(), orderId: id, fromStatus: null, toStatus: "PENDING", createdAt: placedAt });
      if (cancelled) {
        events.push({ id: createId(), orderId: id, fromStatus: "PENDING", toStatus: "CANCELLED", changedById: admins[0] ?? server, createdAt: preparing });
        return;
      }
      events.push(
        { id: createId(), orderId: id, fromStatus: "PENDING", toStatus: "PREPARING", changedById: server, createdAt: preparing },
        { id: createId(), orderId: id, fromStatus: "PREPARING", toStatus: "READY", changedById: server, createdAt: ready },
        { id: createId(), orderId: id, fromStatus: "READY", toStatus: "DELIVERED", changedById: server, createdAt: delivered }
      );
      const cash = random() < (dineIn ? 0.4 : 0.3);
      if (cash) cashTotal = cashTotal.add(total);
      payments.push({
        id: createId(),
        businessId,
        orderId: id,
        provider: cash ? "CASH_REGISTER" : "CARD_TERMINAL",
        status: "SUCCEEDED",
        amount: total,
        currency: business.currency,
        collectedByUserId: cash ? server : null,
        cashSessionId: cash ? sessionId : null,
        paidAt: delivered,
        createdAt: delivered,
        updatedAt: delivered,
      });
    });

    counters.push({ localDate: `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`, lastNumber: minutes.length });

    // One cash shift per day that had a cashier, closed after hours (today's stays with the live demo, not here).
    if (cashier && offset < 0) {
      const openingFloat = D(100);
      const expected = openingFloat.add(cashTotal);
      // Most nights the count matches; now and then it is a little off, as it really is.
      const difference = random() < 0.8 ? D(0) : D(between(-15, 10));
      sessions.push({
        id: sessionId,
        businessId,
        openedById: cashier,
        openedAt: localWallClockToUtc(date.year, date.month, date.day, firstOpen - 15, tz),
        openingFloat,
        closedById: cashier,
        closedAt: localWallClockToUtc(date.year, date.month, date.day, lastClose + 20, tz),
        expectedAmount: expected,
        countedAmount: expected.add(difference),
        difference,
      });
    } else {
      // No shift to attach today's cash to: those payments keep no session.
      for (const p of payments) if (p.cashSessionId === sessionId) p.cashSessionId = null;
    }
  }

  // Reservations: the past, today and the days ahead.
  const reservations: Prisma.ReservationCreateManyInput[] = [];
  if (options.reservationsPerDay > 0 && tables.length > 0) {
    const active = await prisma.reservation.findMany({
      where: { businessId, status: { in: ["PENDING", "CONFIRMED", "SEATED"] } },
      select: { tableId: true, reservedFor: true, endsAt: true },
    });
    const busy = active.filter((r) => r.tableId).map((r) => ({ tableId: r.tableId!, start: r.reservedFor, end: r.endsAt }));
    const free = (tableId: string, start: Date, end: Date) => !busy.some((b) => b.tableId === tableId && b.start < end && start < b.end);

    for (let offset = -options.days; offset <= options.daysAhead; offset++) {
      const date = dayOf(offset);
      const windows = windowsFor(date);
      if (windows.length === 0) continue;
      const wanted = Math.round(options.reservationsPerDay * WEEKDAY_WEIGHT[dayOfWeekFor(date)] * (offset > 0 ? 0.7 - offset * 0.03 : 1) * (0.75 + random() * 0.5));
      for (let n = 0; n < wanted; n++) {
        const w = pick(windows);
        const slots = Math.floor((w.closesAt - 90 - w.opensAt) / 30);
        if (slots <= 0) continue;
        const minute = w.opensAt + 30 * between(0, slots);
        const reservedFor = localWallClockToUtc(date.year, date.month, date.day, minute, tz);
        const endsAt = new Date(reservedFor.getTime() + 90 * 60_000);
        const partySize = random() < 0.6 ? 2 : between(3, 6);
        const past = endsAt < now;
        const status: Prisma.ReservationCreateManyInput["status"] = past
          ? random() < 0.82 ? "COMPLETED" : random() < 0.5 ? "NO_SHOW" : "CANCELLED"
          : reservedFor < now
            ? "SEATED"
            : random() < 0.75 ? "CONFIRMED" : "PENDING";
        const blocking = status === "PENDING" || status === "CONFIRMED" || status === "SEATED";
        const fits = tables.filter((t) => t.seats >= partySize);
        const candidates = (fits.length ? fits : tables).filter((t) => !blocking || free(t.id, reservedFor, endsAt));
        if (candidates.length === 0) continue;
        const table = pick(candidates);
        if (blocking) busy.push({ tableId: table.id, start: reservedFor, end: endsAt });
        const guest = name();
        const createdAt = new Date(reservedFor.getTime() - between(1, 9) * DAY_MS);
        reservations.push({
          id: createId(),
          businessId,
          tableId: table.id,
          guestName: guest,
          guestEmail: `${guest.split(" ")[0].normalize("NFD").replace(/[^a-zA-Z]/g, "").toLowerCase()}@example.com`,
          guestPhone: "+52 662 000 0000",
          locale: random() < 0.7 ? "es" : "en",
          partySize,
          reservedFor,
          durationMinutes: 90,
          endsAt,
          status,
          confirmationCode: createId(),
          confirmedAt: status === "PENDING" ? null : createdAt,
          seatedAt: status === "SEATED" || status === "COMPLETED" ? reservedFor : null,
          cancelledAt: status === "CANCELLED" ? new Date(reservedFor.getTime() - DAY_MS) : null,
          notes: partySize > 4 && random() < 0.4 ? "Birthday: cake at the end" : null,
          createdAt: createdAt < now ? createdAt : now,
          updatedAt: now,
        });
      }
    }
  }

  // Shifts before the payments that point at them, orders before their
  // children. Batches, not one long transaction: AGENTS.md keeps every
  // transaction under Prisma's 5 s, which the realtime recovery window is
  // sized against. A run that stops half way is not repeated (the check at
  // the top sees the orders already there); reset the database instead.
  await prisma.cashSession.createMany({ data: sessions });
  for (let i = 0; i < orders.length; i += 500) await prisma.order.createMany({ data: orders.slice(i, i + 500) });
  for (let i = 0; i < items.length; i += 1000) await prisma.orderItem.createMany({ data: items.slice(i, i + 1000) });
  for (let i = 0; i < payments.length; i += 1000) await prisma.payment.createMany({ data: payments.slice(i, i + 1000) });
  for (let i = 0; i < events.length; i += 1000) await prisma.orderStatusEvent.createMany({ data: events.slice(i, i + 1000) });
  for (let i = 0; i < reservations.length; i += 500) await prisma.reservation.createMany({ data: reservations.slice(i, i + 500) });
  // Never lower a counter: a folio already handed out today must not repeat.
  for (const c of counters) {
    await prisma.$executeRaw`
      INSERT INTO "OrderCounter" ("businessId", "localDate", "lastNumber") VALUES (${businessId}, ${c.localDate}, ${c.lastNumber})
      ON CONFLICT ("businessId", "localDate") DO UPDATE SET "lastNumber" = GREATEST("OrderCounter"."lastNumber", EXCLUDED."lastNumber")`;
  }

  return { orders: orders.length, reservations: reservations.length };
}
