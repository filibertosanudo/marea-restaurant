import { describe, it, expect } from "vitest";
import { checkoutSchema } from "./schemas";

describe("checkoutSchema", () => {
  it("accepts a guest with no email at all", () => {
    const result = checkoutSchema.safeParse({ guestName: "Ana", guestPhone: "555-0100" });

    expect(result.success).toBe(true);
    expect(result.data?.guestEmail).toBeUndefined();
  });

  it("normalizes a blank email to undefined instead of an empty string", () => {
    const result = checkoutSchema.safeParse({ guestName: "Ana", guestPhone: "555-0100", guestEmail: "" });

    expect(result.success).toBe(true);
    expect(result.data?.guestEmail).toBeUndefined();
  });

  it("keeps a real email as-is", () => {
    const result = checkoutSchema.safeParse({
      guestName: "Ana",
      guestPhone: "555-0100",
      guestEmail: "ana@example.com",
    });

    expect(result.success).toBe(true);
    expect(result.data?.guestEmail).toBe("ana@example.com");
  });
});
