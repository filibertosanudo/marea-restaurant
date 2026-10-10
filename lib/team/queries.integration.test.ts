import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { listOwnersRaw, listTeamMembersRaw } from "./queries";
import { makeBusiness, makeMembership, makeOrgAdmin, makeOrganization, makeStaff } from "@/test/factories";

describe("listTeamMembersRaw", () => {
  it("lists memberships for this business, with their user rows joined", async () => {
    const business = await makeBusiness();
    const user = await makeStaff("STAFF");
    await prisma.businessMembership.create({ data: { businessId: business.id, userId: user.id, role: "STAFF" } });

    const members = await listTeamMembersRaw(business.id);

    expect(members).toHaveLength(1);
    expect(members[0].user.id).toBe(user.id);
  });

  it("leaves an owner out of the editable team even when they hold a membership", async () => {
    const organization = await makeOrganization();
    const business = await makeBusiness({ organizationId: organization.id });
    const owner = await makeOrgAdmin(organization.id);
    await makeMembership(owner.id, business.id, { role: "STAFF" });

    expect(await listTeamMembersRaw(business.id)).toHaveLength(0);
  });
});

describe("listOwnersRaw", () => {
  it("lists the organization's ORG_ADMINs and nobody else", async () => {
    const organization = await makeOrganization();
    const other = await makeOrganization();
    const owner = await makeOrgAdmin(organization.id, { name: "Ana" });
    await makeOrgAdmin(other.id);
    await makeStaff("BUSINESS_ADMIN");

    const owners = await listOwnersRaw(organization.id);

    expect(owners.map((o) => o.id)).toEqual([owner.id]);
  });

  it("is empty for a business with no organization", async () => {
    expect(await listOwnersRaw(null)).toEqual([]);
  });
});
