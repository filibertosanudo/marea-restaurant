import { describe, expect, it } from "vitest";
import { mapCardPaymentsStatus } from "@/lib/stripe/connect";

describe("mapCardPaymentsStatus", () => {
  it("maps the four states Stripe reports", () => {
    expect(mapCardPaymentsStatus("active")).toBe("ACTIVE");
    expect(mapCardPaymentsStatus("pending")).toBe("PENDING");
    expect(mapCardPaymentsStatus("restricted")).toBe("RESTRICTED");
    expect(mapCardPaymentsStatus("unsupported")).toBe("UNSUPPORTED");
  });

  it("never turns anything it does not recognise into active", () => {
    for (const odd of ["under_review", "ACTIVE", "Active", "", "constructor", "__proto__", null, undefined]) {
      expect(mapCardPaymentsStatus(odd as string | null | undefined), String(odd)).toBe("RESTRICTED");
    }
  });
});
