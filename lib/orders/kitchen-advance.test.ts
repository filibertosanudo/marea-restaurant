import { describe, it, expect } from "vitest";
import { kitchenAdvanceLabelKey } from "./kitchen-advance";

describe("kitchenAdvanceLabelKey", () => {
  it("labels the two steps the kitchen can take", () => {
    expect(kitchenAdvanceLabelKey("PENDING")).toBe("advanceStart");
    expect(kitchenAdvanceLabelKey("PREPARING")).toBe("advanceReady");
  });

  it("has no button for an order that is ready, delivered or cancelled", () => {
    // READY has a next status (DELIVERED) in the state machine, which is what
    // once rendered an empty, tappable button on the kitchen screen.
    for (const status of ["READY", "DELIVERED", "CANCELLED"] as const) {
      expect(kitchenAdvanceLabelKey(status)).toBeNull();
    }
  });
});
