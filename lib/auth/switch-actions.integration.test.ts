import { beforeEach, describe, expect, it } from "vitest";
import { unstable_update } from "@/auth";
import { switchBusinessAction } from "@/lib/auth/switch-actions";
import { makeBusiness, makeMembership, makeOrgAdmin, makeOrganization, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { vi } from "vitest";

const update = vi.mocked(unstable_update);

beforeEach(() => {
  update.mockClear();
});

describe("switchBusinessAction", () => {
  it("asks the session to move to a business of the caller's own organization", async () => {
    const org = await makeOrganization();
    const a1 = await makeBusiness({ slug: "a1", organizationId: org.id });
    const a2 = await makeBusiness({ slug: "a2", organizationId: org.id });
    const owner = await makeOrgAdmin(org.id);
    setTestSession(sessionUserFromRow(owner, { role: "BUSINESS_ADMIN", businessId: a1.id, orgAdmin: true }));

    expect(await switchBusinessAction(a2.id)).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith({ switchBusinessId: a2.id });
  });

  it("refuses another organization's business and never touches the session", async () => {
    const orgA = await makeOrganization();
    const orgB = await makeOrganization();
    const a1 = await makeBusiness({ slug: "a1", organizationId: orgA.id });
    const b1 = await makeBusiness({ slug: "b1", organizationId: orgB.id });
    const owner = await makeOrgAdmin(orgA.id);
    setTestSession(sessionUserFromRow(owner, { role: "BUSINESS_ADMIN", businessId: a1.id, orgAdmin: true }));

    expect(await switchBusinessAction(b1.id)).toEqual({ ok: false, error: "forbidden" });
    expect(update).not.toHaveBeenCalled();
  });

  it("lets a member move between their two businesses and refuses a third", async () => {
    const a = await makeBusiness({ slug: "a" });
    const b = await makeBusiness({ slug: "b" });
    const c = await makeBusiness({ slug: "c" });
    const waiter = await makeStaff("CUSTOMER");
    await makeMembership(waiter.id, a.id);
    await makeMembership(waiter.id, b.id);
    setTestSession(sessionUserFromRow(waiter, { role: "STAFF", businessId: a.id }));

    expect(await switchBusinessAction(b.id)).toEqual({ ok: true });
    expect(await switchBusinessAction(c.id)).toEqual({ ok: false, error: "forbidden" });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("requires a signed-in staff member", async () => {
    const a = await makeBusiness({ slug: "a" });
    await expect(switchBusinessAction(a.id)).rejects.toThrow("Not authenticated");
  });
});
