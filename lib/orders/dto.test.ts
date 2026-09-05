import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { toTrackedOrderDTO, toBoardOrderDTO, toOrderPaymentDetailDTO } from "./dto";

const NOW = new Date("2026-06-01T12:00:00Z");
const amount = (v: string) => new Prisma.Decimal(v);

function baseOrder() {
  return {
    id: "order_1",
    orderNumber: "A-0001",
    status: "PENDING" as const,
    type: "TAKEAWAY" as const,
    total: amount("23.19"),
    currency: "MXN",
    placedAt: NOW,
    cancellationReason: null,
    notes: null,
    table: null,
    items: [
      {
        id: "item_1",
        nameSnapshot: "Lobster Thermidor",
        quantity: 2,
        notes: null,
        modifiers: [{ nameSnapshot: "Extra cheese" }],
      },
    ],
  };
}

describe("toTrackedOrderDTO", () => {
  it("reads the payment status from the order's own payment, not a hardcoded default", () => {
    const dto = toTrackedOrderDTO({ ...baseOrder(), payments: [{ status: "SUCCEEDED" }] } as never);
    expect(dto.paymentStatus).toBe("SUCCEEDED");
    expect(dto.items[0].name).toBe("Lobster Thermidor");
    expect(dto.items[0].modifiers).toEqual(["Extra cheese"]);
  });

  it("is null when the order has no payment row yet", () => {
    const dto = toTrackedOrderDTO({ ...baseOrder(), payments: [] } as never);
    expect(dto.paymentStatus).toBeNull();
  });

  it("uses the table's own code as the label when the order is dine-in", () => {
    const dto = toTrackedOrderDTO({ ...baseOrder(), table: { code: "M-04" }, payments: [] } as never);
    expect(dto.tableLabel).toBe("M-04");
  });

  it("falls back to 0.00 when total is missing", () => {
    const dto = toTrackedOrderDTO({ ...baseOrder(), total: null, payments: [] } as never);
    expect(dto.total).toBe("0.00");
  });
});

describe("toBoardOrderDTO", () => {
  function boardOrder(payments: { status: string; amount: Prisma.Decimal; provider: string; refunds: unknown[] }[]) {
    return { ...baseOrder(), payments } as never;
  }

  it("reads DUE for an order with an open cash payment", () => {
    const dto = toBoardOrderDTO(
      boardOrder([{ status: "PENDING", amount: amount("23.19"), provider: "CASH_REGISTER", refunds: [] }])
    );
    expect(dto.paymentReading).toBe("DUE");
    expect(dto.canCollectCash).toBe(true);
  });

  it("reads PAID once the payment total is settled", () => {
    const dto = toBoardOrderDTO(
      boardOrder([{ status: "SUCCEEDED", amount: amount("23.19"), provider: "CASH_REGISTER", refunds: [] }])
    );
    expect(dto.paymentReading).toBe("PAID");
    expect(dto.canCollectCash).toBe(false);
  });

  it("reads REFUNDED once any amount has come back, even if not fully settled either way", () => {
    const dto = toBoardOrderDTO(
      boardOrder([
        {
          status: "PARTIALLY_REFUNDED",
          amount: amount("23.19"),
          provider: "STRIPE",
          refunds: [{ status: "SUCCEEDED", amount: amount("5.00") }],
        },
      ])
    );
    expect(dto.paymentReading).toBe("REFUNDED");
  });

  it("reads NONE for a cancelled order that was never paid", () => {
    const dto = toBoardOrderDTO({ ...baseOrder(), status: "CANCELLED", payments: [] } as never);
    expect(dto.paymentReading).toBe("NONE");
  });

  it("reads DUE, not NONE, for a live order that just hasn't been paid yet", () => {
    const dto = toBoardOrderDTO(boardOrder([]));
    expect(dto.paymentReading).toBe("DUE");
  });

  it("uses the table's own code as the label for a dine-in board order", () => {
    const dto = toBoardOrderDTO({ ...baseOrder(), table: { code: "M-04" }, payments: [] } as never);
    expect(dto.tableLabel).toBe("M-04");
  });
});

describe("toOrderPaymentDetailDTO", () => {
  it("carries paid/refunded/refundable totals and per-refund detail", () => {
    const dto = toOrderPaymentDetailDTO({
      id: "order_1",
      orderNumber: "A-0001",
      total: amount("23.19"),
      currency: "MXN",
      payments: [
        {
          id: "pay_1",
          provider: "STRIPE",
          status: "SUCCEEDED",
          amount: amount("23.19"),
          paidAt: NOW,
          createdAt: NOW,
          paymentMethodBrand: "visa",
          paymentMethodLast4: "4242",
          receiptUrl: null,
          refunds: [
            {
              id: "refund_1",
              amount: amount("5.00"),
              status: "SUCCEEDED",
              reason: "guest request",
              createdAt: NOW,
            },
          ],
        },
      ],
    } as never);

    expect(dto.paidTotal).toBe("23.19");
    expect(dto.refundedTotal).toBe("5.00");
    expect(dto.refundableTotal).toBe("18.19");
    expect(dto.isSettled).toBe(false);
    expect(dto.payments[0].refunds[0].reason).toBe("guest request");
  });

  it("handles a not-yet-paid payment with no paidAt and a still-pending refund with no amount recorded yet", () => {
    const dto = toOrderPaymentDetailDTO({
      id: "order_1",
      orderNumber: "A-0001",
      total: amount("23.19"),
      currency: "MXN",
      payments: [
        {
          id: "pay_1",
          provider: "STRIPE",
          status: "PENDING",
          amount: null,
          paidAt: null,
          createdAt: NOW,
          paymentMethodBrand: null,
          paymentMethodLast4: null,
          receiptUrl: null,
          refunds: [
            {
              id: "refund_1",
              amount: null,
              status: "PENDING",
              reason: null,
              createdAt: NOW,
            },
          ],
        },
      ],
    } as never);

    expect(dto.payments[0].paidAt).toBeNull();
    expect(dto.payments[0].amount).toBe("0.00");
    expect(dto.payments[0].refunds[0].amount).toBe("0.00");
  });
});
