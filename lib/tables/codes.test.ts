import { describe, expect, it } from "vitest";
import { nextTableCodes } from "./codes";

describe("nextTableCodes", () => {
  it("starts at 01 with no existing codes under the prefix", () => {
    expect(nextTableCodes([], "M-", 3)).toEqual(["M-01", "M-02", "M-03"]);
  });

  it("picks up numbering after the highest existing code", () => {
    expect(nextTableCodes(["M-01", "M-02", "M-12"], "M-", 2)).toEqual(["M-13", "M-14"]);
  });

  it("ignores codes under a different prefix", () => {
    expect(nextTableCodes(["T-01", "T-02"], "M-", 1)).toEqual(["M-01"]);
  });

  it("preserves the existing digit width instead of resetting to 2", () => {
    expect(nextTableCodes(["M-001"], "M-", 1)).toEqual(["M-002"]);
  });

  it("ignores a code that matches the prefix but isn't purely numeric after it", () => {
    expect(nextTableCodes(["M-VIP", "M-05"], "M-", 1)).toEqual(["M-06"]);
  });

  it("treats the prefix literally, not as a regex", () => {
    expect(nextTableCodes(["MX01"], "M.", 1)).toEqual(["M.01"]);
  });
});
