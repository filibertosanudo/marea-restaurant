import { describe, it, expect } from "vitest";
import { addToCartSchema, updateCartItemQuantitySchema } from "./schemas";

describe("addToCartSchema", () => {
  it("accepts a minimal valid payload, defaulting optionIds to empty", () => {
    const result = addToCartSchema.safeParse({ menuItemId: "item_1", quantity: "2" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.optionIds).toEqual([]);
  });

  it("rejects a quantity of zero", () => {
    expect(addToCartSchema.safeParse({ menuItemId: "item_1", quantity: "0" }).success).toBe(false);
  });

  it("rejects more than 20 of one item", () => {
    expect(addToCartSchema.safeParse({ menuItemId: "item_1", quantity: "21" }).success).toBe(false);
  });
});

describe("updateCartItemQuantitySchema", () => {
  it("allows quantity 0 — removing the line", () => {
    expect(updateCartItemQuantitySchema.safeParse({ cartItemId: "ci_1", quantity: "0" }).success).toBe(true);
  });

  it("rejects a negative quantity", () => {
    expect(updateCartItemQuantitySchema.safeParse({ cartItemId: "ci_1", quantity: "-1" }).success).toBe(false);
  });
});
