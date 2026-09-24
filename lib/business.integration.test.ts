import { describe, it, expect } from "vitest";
import { getBusinessForRequest, getPublicBusiness } from "@/lib/business";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { setTestHost } from "@/test/stubs/next-headers";

describe("getPublicBusiness", () => {
  it("resolves each subdomain to its own business", async () => {
    const marea = await makeBusiness({ slug: "marea" });
    const cala = await makeBusiness({ slug: "cala" });

    setTestHost("marea.localhost:3000");
    expect((await getPublicBusiness()).id).toBe(marea.id);
    setTestHost("cala.localhost:3000");
    expect((await getPublicBusiness()).id).toBe(cala.id);
  });

  it("falls back to the only business on a bare domain, and to nobody once there are two", async () => {
    const only = await makeBusiness({ slug: "marea" });
    setTestHost("localhost:3000");
    expect((await getPublicBusiness()).id).toBe(only.id);

    await makeBusiness({ slug: "cala" });
    // The default is cached across requests; a new business expires it in
    // production through invalidateBusinessCache, which the test's
    // unstable_cache passthrough does not need.
    await expect(getPublicBusiness()).rejects.toThrow("NOT_FOUND");
  });

  it("finds no business for an unknown subdomain", async () => {
    await makeBusiness({ slug: "marea" });
    await makeBusiness({ slug: "cala" });
    setTestHost("nope.localhost:3000");
    await expect(getPublicBusiness()).rejects.toThrow("NOT_FOUND");
  });

  it("ignores the session: a staff member of one business sees the host's business", async () => {
    const marea = await makeBusiness({ slug: "marea" });
    const cala = await makeBusiness({ slug: "cala" });
    const staff = await makeStaff("BUSINESS_ADMIN");
    setTestSession(sessionUserFromRow(staff, { businessId: marea.id }));

    setTestHost("cala.localhost:3000");
    expect((await getPublicBusiness()).id).toBe(cala.id);
  });
});

describe("getBusinessForRequest", () => {
  it("returns the business the session was issued for, whatever the host says", async () => {
    const marea = await makeBusiness({ slug: "marea" });
    await makeBusiness({ slug: "cala" });
    const staff = await makeStaff("BUSINESS_ADMIN");
    setTestSession(sessionUserFromRow(staff, { businessId: marea.id }));

    setTestHost("cala.localhost:3000");
    expect((await getBusinessForRequest()).id).toBe(marea.id);
  });

  it("falls back to the host for a session with no business", async () => {
    await makeBusiness({ slug: "marea" });
    const cala = await makeBusiness({ slug: "cala" });
    const operator = await makeStaff("SUPER_ADMIN");
    setTestSession(sessionUserFromRow(operator));

    setTestHost("cala.localhost:3000");
    expect((await getBusinessForRequest()).id).toBe(cala.id);
  });

  it("refuses a session whose business no longer exists", async () => {
    const staff = await makeStaff("BUSINESS_ADMIN");
    setTestSession(sessionUserFromRow(staff, { businessId: "gone" }));
    await expect(getBusinessForRequest()).rejects.toThrow("NOT_FOUND");
  });
});
