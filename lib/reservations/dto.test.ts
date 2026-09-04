import { describe, it, expect } from "vitest";
import {
  canCancelReservation,
  isReservationOverdue,
  toReservationLookupDTO,
  toAgendaReservationDTO,
  summarizeAgenda,
} from "./dto";
import type { Reservation, RestaurantTable } from "@/lib/generated/prisma/client";

const NOW = new Date("2026-06-01T12:00:00Z");

function baseReservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: "res_1",
    businessId: "biz_1",
    customerId: null,
    tableId: "table_1",
    guestName: "Ana",
    guestEmail: null,
    guestPhone: null,
    partySize: 2,
    reservedFor: new Date("2026-06-01T14:00:00Z"),
    durationMinutes: 90,
    endsAt: new Date("2026-06-01T15:30:00Z"),
    status: "CONFIRMED",
    confirmationCode: "abc123",
    notes: null,
    confirmedAt: null,
    seatedAt: null,
    completedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Reservation;
}

describe("canCancelReservation", () => {
  it("allows cancelling with enough lead time", () => {
    const reservation = baseReservation({ reservedFor: new Date(NOW.getTime() + 3 * 60 * 60 * 1000) });
    expect(canCancelReservation(reservation, NOW, 120)).toBe(true);
  });

  it("refuses once inside the minimum cancel lead time", () => {
    const reservation = baseReservation({ reservedFor: new Date(NOW.getTime() + 60 * 60 * 1000) });
    expect(canCancelReservation(reservation, NOW, 120)).toBe(false);
  });

  it("refuses a status that isn't cancellable regardless of lead time", () => {
    const reservation = baseReservation({
      status: "COMPLETED",
      reservedFor: new Date(NOW.getTime() + 10 * 60 * 60 * 1000),
    });
    expect(canCancelReservation(reservation, NOW, 120)).toBe(false);
  });
});

describe("isReservationOverdue", () => {
  it("is overdue once PENDING and past its own start time", () => {
    const reservation = baseReservation({ status: "PENDING", reservedFor: new Date(NOW.getTime() - 1000) });
    expect(isReservationOverdue(reservation, NOW)).toBe(true);
  });

  it("is not overdue while still in the future", () => {
    const reservation = baseReservation({ status: "PENDING", reservedFor: new Date(NOW.getTime() + 1000) });
    expect(isReservationOverdue(reservation, NOW)).toBe(false);
  });

  it("a SEATED reservation in the past is not overdue — it already happened", () => {
    const reservation = baseReservation({ status: "SEATED", reservedFor: new Date(NOW.getTime() - 1000) });
    expect(isReservationOverdue(reservation, NOW)).toBe(false);
  });
});

describe("toReservationLookupDTO", () => {
  it("formats a table label as zone + code when both are set", () => {
    const table: Pick<RestaurantTable, "code" | "zone"> = { code: "T4", zone: "Terrace" };
    const dto = toReservationLookupDTO(
      { ...baseReservation(), table },
      "America/Hermosillo",
      "en",
      NOW,
      120
    );
    expect(dto.tableLabel).toBe("Terrace · T4");
    expect(dto.confirmationCode).toBe("abc123");
  });

  it("falls back to just the code when there's no zone", () => {
    const table: Pick<RestaurantTable, "code" | "zone"> = { code: "T4", zone: null };
    const dto = toReservationLookupDTO({ ...baseReservation(), table }, "America/Hermosillo", "en", NOW, 120);
    expect(dto.tableLabel).toBe("T4");
  });

  it("carries null for a reservation with no table assigned yet", () => {
    const dto = toReservationLookupDTO({ ...baseReservation(), table: null }, "America/Hermosillo", "en", NOW, 120);
    expect(dto.tableLabel).toBeNull();
  });
});

describe("toAgendaReservationDTO", () => {
  it("carries the raw table id alongside its formatted label", () => {
    const table: Pick<RestaurantTable, "id" | "code" | "zone"> = { id: "table_9", code: "B2", zone: null };
    const dto = toAgendaReservationDTO(
      { ...baseReservation({ tableId: "table_9" }), table },
      "America/Hermosillo",
      "en",
      NOW
    );
    expect(dto.tableId).toBe("table_9");
    expect(dto.tableLabel).toBe("B2");
  });
});

describe("summarizeAgenda", () => {
  it("tallies total, pending, seated, and overdue independently", () => {
    const summary = summarizeAgenda([
      { status: "PENDING", isOverdue: true },
      { status: "PENDING", isOverdue: false },
      { status: "SEATED", isOverdue: false },
      { status: "CONFIRMED", isOverdue: false },
    ]);
    expect(summary).toEqual({ total: 4, pending: 2, seated: 1, overdue: 1 });
  });
});
