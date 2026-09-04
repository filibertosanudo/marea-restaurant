import { describe, it, expect } from "vitest";
import { getNextStatus, canAdvanceTo, isCancellable } from "./state-machine";

describe("getNextStatus", () => {
  it("returns the single legal next step", () => {
    expect(getNextStatus("PENDING")).toBe("PREPARING");
    expect(getNextStatus("PREPARING")).toBe("READY");
    expect(getNextStatus("READY")).toBe("DELIVERED");
  });

  it("returns null for a terminal status", () => {
    expect(getNextStatus("DELIVERED")).toBeNull();
    expect(getNextStatus("CANCELLED")).toBeNull();
  });
});

describe("canAdvanceTo", () => {
  it("accepts the one legal forward step", () => {
    expect(canAdvanceTo("PENDING", "PREPARING")).toBe(true);
  });

  it("rejects skipping ahead or moving backward", () => {
    expect(canAdvanceTo("PENDING", "READY")).toBe(false);
    expect(canAdvanceTo("READY", "PENDING")).toBe(false);
  });
});

describe("isCancellable", () => {
  it("is cancellable from every live status", () => {
    expect(isCancellable("PENDING")).toBe(true);
    expect(isCancellable("PREPARING")).toBe(true);
    expect(isCancellable("READY")).toBe(true);
  });

  it("is not cancellable once terminal", () => {
    expect(isCancellable("DELIVERED")).toBe(false);
    expect(isCancellable("CANCELLED")).toBe(false);
  });
});
