import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { listTeamMembersRaw } from "./queries";
import { makeBusiness, makeStaff } from "@/test/factories";

describe("listTeamMembersRaw", () => {
  it("lists memberships for this business, with their user rows joined", async () => {
    const business = await makeBusiness();
    const user = await makeStaff("STAFF");
    await prisma.businessMembership.create({ data: { businessId: business.id, userId: user.id, role: "STAFF" } });

    const members = await listTeamMembersRaw(business.id);

    expect(members).toHaveLength(1);
    expect(members[0].user.id).toBe(user.id);
  });
});
