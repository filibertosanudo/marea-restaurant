import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { advanceOnboardingAction } from "./actions";

async function loginAsAdmin(businessId: string) {
  const user = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(user, { businessId }));
}

describe("advanceOnboardingAction", () => {
  it("bumps the wizard's step", async () => {
    const business = await makeBusiness({ onboardingStep: 1, onboardingCompletedAt: null });
    await loginAsAdmin(business.id);

    await advanceOnboardingAction(2);

    const updated = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(updated.onboardingStep).toBe(2);
    expect(updated.onboardingCompletedAt).toBeNull();
  });

  it("never rewinds progress: revisiting an earlier step to edit it doesn't lower the bookmark", async () => {
    const business = await makeBusiness({ onboardingStep: 3, onboardingCompletedAt: null });
    await loginAsAdmin(business.id);

    await advanceOnboardingAction(2);

    const updated = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(updated.onboardingStep).toBe(3);
  });

  it("marks the wizard complete once the step passes the last one", async () => {
    const business = await makeBusiness({ onboardingStep: 4, onboardingCompletedAt: null });
    await loginAsAdmin(business.id);

    await advanceOnboardingAction(5);

    const updated = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(updated.onboardingStep).toBe(4);
    expect(updated.onboardingCompletedAt).not.toBeNull();
  });

  it("does not touch onboardingCompletedAt a second time once it's set", async () => {
    const completedAt = new Date("2027-01-01T00:00:00Z");
    const business = await makeBusiness({ onboardingStep: 4, onboardingCompletedAt: completedAt });
    await loginAsAdmin(business.id);

    await advanceOnboardingAction(5);

    const updated = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(updated.onboardingCompletedAt).toEqual(completedAt);
  });
});
