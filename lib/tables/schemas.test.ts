import { describe, it, expect } from "vitest";
import { tableSchema, batchTableSchema } from "./schemas";

describe("tableSchema", () => {
  it("accepts a minimal valid table, transforming a blank zone to undefined", () => {
    const result = tableSchema.safeParse({ code: "T-01", zone: "  ", seats: "4" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.zone).toBeUndefined();
  });

  it("rejects an empty code", () => {
    expect(tableSchema.safeParse({ code: "", seats: "4" }).success).toBe(false);
  });

  it("rejects zero seats", () => {
    expect(tableSchema.safeParse({ code: "T-01", seats: "0" }).success).toBe(false);
  });
});

describe("batchTableSchema", () => {
  it("accepts a valid batch request", () => {
    expect(
      batchTableSchema.safeParse({ seats: "2", quantity: "10", codePrefix: "T-" }).success
    ).toBe(true);
  });

  it("rejects a quantity over the cap", () => {
    expect(batchTableSchema.safeParse({ seats: "2", quantity: "51", codePrefix: "T-" }).success).toBe(false);
  });

  it("rejects an empty code prefix", () => {
    expect(batchTableSchema.safeParse({ seats: "2", quantity: "5", codePrefix: "" }).success).toBe(false);
  });
});
