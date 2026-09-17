import { describe, it, expect } from "vitest";
import { submitTestimonialSchema } from "./schemas";

describe("submitTestimonialSchema", () => {
  it("accepts a rating with no quote", () => {
    const result = submitTestimonialSchema.safeParse({ rating: 5 });
    expect(result.success).toBe(true);
  });

  it("accepts a rating with a quote", () => {
    const result = submitTestimonialSchema.safeParse({ rating: 4, quote: "Great food." });
    expect(result.success).toBe(true);
  });

  it("rejects a rating below 1", () => {
    const result = submitTestimonialSchema.safeParse({ rating: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects a rating above 5", () => {
    const result = submitTestimonialSchema.safeParse({ rating: 6 });
    expect(result.success).toBe(false);
  });

  it("rejects a non-integer rating", () => {
    const result = submitTestimonialSchema.safeParse({ rating: 3.5 });
    expect(result.success).toBe(false);
  });

  it("rejects a quote over the length limit", () => {
    const result = submitTestimonialSchema.safeParse({ rating: 5, quote: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("rejects a missing rating", () => {
    const result = submitTestimonialSchema.safeParse({ quote: "Nice" });
    expect(result.success).toBe(false);
  });
});
