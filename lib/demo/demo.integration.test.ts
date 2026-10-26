import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@auth/core/errors";
import { prisma } from "@/lib/prisma";
import { authMock } from "@/test/stubs/auth-config";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { recordLoginAttempt, isRateLimited } from "@/lib/auth/rate-limit";
import { changePasswordAction } from "@/lib/auth/actions";
import { signupAction } from "@/lib/auth/signup-actions";
import { createTeamMemberAction } from "@/lib/team/actions";
import { DemoModeError } from "./mode";
import { demoLoginAction } from "./actions";

// DEMO_MODE on and off through the real actions it changes. The switch is a
// flag here rather than the environment, which lib/env reads once.
const demo = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/demo/mode", async (importOriginal) => {
  const real = await importOriginal<typeof import("./mode")>();
  return {
    ...real,
    isDemo: () => demo.on,
    assertNotDemo: (what: string) => {
      if (demo.on) throw new real.DemoModeError(what);
    },
  };
});

afterEach(() => {
  demo.on = false;
  vi.clearAllMocks();
});

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("demoLoginAction", () => {
  it("does nothing outside the demo", async () => {
    expect(await demoLoginAction(undefined, form({ persona: "owner" }))).toEqual({ error: "unavailable" });
    expect(authMock.signIn).not.toHaveBeenCalled();
  });

  it("signs in as the persona, with its own published password, and lands on its screen", async () => {
    demo.on = true;
    await demoLoginAction(undefined, form({ persona: "kitchen" }));
    expect(authMock.signIn).toHaveBeenCalledWith("credentials", { email: "mesera@marea.test", password: "MareaMesera123!", redirectTo: "/admin/cocina" });
  });

  it("refuses a persona that does not exist, and reports a failed sign-in", async () => {
    demo.on = true;
    expect(await demoLoginAction(undefined, form({ persona: "super" }))).toEqual({ error: "unavailable" });
    authMock.signIn.mockRejectedValueOnce(new AuthError("CredentialsSignin"));
    expect(await demoLoginAction(undefined, form({ persona: "owner" }))).toEqual({ error: "failed" });
  });
});

describe("the login rate limit in the demo", () => {
  async function failFiveTimes(email: string, ip: string) {
    for (let i = 0; i < 5; i++) await recordLoginAttempt(email, ip, false);
  }

  it("never locks a shared demo account by its email, only by the visitor's IP", async () => {
    demo.on = true;
    await failFiveTimes("owner@marea.test", "203.0.113.1");
    expect(await isRateLimited("owner@marea.test", "203.0.113.2")).toBe(false);
    for (let i = 0; i < 20; i++) await recordLoginAttempt("owner@marea.test", "203.0.113.9", false);
    expect(await isRateLimited("owner@marea.test", "203.0.113.9")).toBe(true);
  });

  it("still locks any other account, and the demo accounts outside the demo", async () => {
    demo.on = true;
    await failFiveTimes("someone@example.com", "203.0.113.3");
    expect(await isRateLimited("someone@example.com", "203.0.113.4")).toBe(true);
    demo.on = false;
    await failFiveTimes("admin@marea.test", "203.0.113.5");
    expect(await isRateLimited("admin@marea.test", "203.0.113.6")).toBe(true);
  });
});

describe("writes the demo refuses", () => {
  it("does not change a shared account's password", async () => {
    demo.on = true;
    const user = await makeStaff("BUSINESS_ADMIN");
    authMock.auth.mockResolvedValue({ user: { id: user.id } });
    const before = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash;

    const result = await changePasswordAction(undefined, form({ currentPassword: "x", newPassword: "greenTurtleUmbrella99", confirmPassword: "greenTurtleUmbrella99" }));

    expect(result).toEqual({ error: "demo" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash).toBe(before);
  });

  it("takes no signups", async () => {
    demo.on = true;
    const result = await signupAction(undefined, form({ businessName: "Nope", slug: "nope", name: "N", email: "n@example.test", password: "greenTurtleUmbrella99", confirmPassword: "greenTurtleUmbrella99", company: "", renderedAt: "0" }));
    expect(result).toEqual({ submitted: false, error: "demo" });
    expect(await prisma.organization.count({ where: { slug: "nope" } })).toBe(0);
  });

  it("keeps signup closed outside the demo too, unless SIGNUP_ENABLED opens it", async () => {
    const result = await signupAction(undefined, form({ businessName: "Closed", slug: "closed", name: "N", email: "c@example.test", password: "greenTurtleUmbrella99", confirmPassword: "greenTurtleUmbrella99", company: "", renderedAt: "0" }));
    expect(result).toEqual({ submitted: false, error: "closed" });
    expect(await prisma.organization.count({ where: { slug: "closed" } })).toBe(0);
  });

  it("does not touch the team", async () => {
    demo.on = true;
    await makeBusiness({ slug: "marea" });
    const admin = await makeStaff("BUSINESS_ADMIN");
    setTestSession(sessionUserFromRow(admin));

    await expect(createTeamMemberAction(undefined, form({ name: "New", email: "new@example.test", role: "STAFF" }))).rejects.toBeInstanceOf(DemoModeError);
  });
});
