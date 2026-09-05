import { describe, it, expect } from "vitest";
import { flattenZodError } from "./flatten-zod-error";

describe("flattenZodError", () => {
  it("maps each issue's dotted path to its message", () => {
    const flat = flattenZodError({
      issues: [
        { path: ["guestName"], message: "Required" },
        { path: ["address", "zip"], message: "Invalid" },
      ],
    });
    expect(flat).toEqual({ guestName: "Required", "address.zip": "Invalid" });
  });

  it("returns an empty object for no issues", () => {
    expect(flattenZodError({ issues: [] })).toEqual({});
  });
});
