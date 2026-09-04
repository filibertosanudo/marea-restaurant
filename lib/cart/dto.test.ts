import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { toCartDTO, EMPTY_CART } from "./dto";

function baseCart(items: unknown[]) {
  return {
    id: "cart_1",
    orderType: "TAKEAWAY" as const,
    tableId: null,
    table: null,
    items,
  } as never;
}

function menuItemLine(overrides: Record<string, unknown> = {}) {
  return {
    id: "line_1",
    menuItemId: "item_1",
    quantity: 1,
    notes: null,
    menuItem: {
      isAvailable: true,
      deletedAt: null,
      basePrice: new Prisma.Decimal("10.00"),
      translations: [{ locale: "en", name: "Lobster Thermidor" }],
    },
    modifiers: [],
    ...overrides,
  };
}

describe("toCartDTO", () => {
  it("computes unit price and line total including modifier price deltas", () => {
    const line = menuItemLine({
      modifiers: [
        {
          option: {
            id: "opt_1",
            isAvailable: true,
            priceDelta: new Prisma.Decimal("2.50"),
            translations: [{ locale: "en", name: "Extra cheese" }],
          },
        },
      ],
    });
    const dto = toCartDTO(baseCart([line]), "en");

    expect(dto.availableItems[0].unitPrice).toBe("12.50");
    expect(dto.subtotal).toBe("12.50");
    expect(dto.itemCount).toBe(1);
  });

  it("puts a line in unavailableItems when the dish itself is unavailable", () => {
    const line = menuItemLine({ menuItem: { ...menuItemLine().menuItem, isAvailable: false } });
    const dto = toCartDTO(baseCart([line]), "en");

    expect(dto.availableItems).toHaveLength(0);
    expect(dto.unavailableItems).toHaveLength(1);
    expect(dto.subtotal).toBe("0.00");
  });

  it("puts a line in unavailableItems when any of its modifiers went unavailable", () => {
    const line = menuItemLine({
      modifiers: [
        {
          option: {
            id: "opt_1",
            isAvailable: false,
            priceDelta: new Prisma.Decimal("0"),
            translations: [],
          },
        },
      ],
    });
    const dto = toCartDTO(baseCart([line]), "en");

    expect(dto.unavailableItems).toHaveLength(1);
  });
});

describe("EMPTY_CART", () => {
  it("is a zero-item, zero-subtotal placeholder", () => {
    expect(EMPTY_CART.itemCount).toBe(0);
    expect(EMPTY_CART.subtotal).toBe("0.00");
  });
});
