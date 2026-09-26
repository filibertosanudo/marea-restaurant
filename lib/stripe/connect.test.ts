import { describe, expect, it } from "vitest";
import { connectAccountKey, mapCardPaymentsStatus } from "@/lib/stripe/connect";

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

describe("connectAccountKey", () => {
  const input = { businessId: "b1", businessName: "Shop", country: "MX", locale: "es" as const, contactEmail: "a@example.com" };

  it("is stable for the same input, so a double click gets one account", () => {
    expect(connectAccountKey(input)).toBe(connectAccountKey({ ...input }));
  });

  it("changes with any parameter, because Stripe answers 409 to one key with different parameters", () => {
    for (const changed of [{ country: "US" }, { businessName: "Other" }, { locale: "en" as const }, { contactEmail: "b@example.com" }]) {
      expect(connectAccountKey({ ...input, ...changed })).not.toBe(connectAccountKey(input));
    }
  });
});
