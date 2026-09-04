import { describe, it, expect, vi, afterEach } from "vitest";
// From @auth/core directly, not the "next-auth" package root — that one's
// own entry point eagerly imports next/server as part of its own env
// checks, which fails outside a real Next.js runtime.
import { AuthError } from "@auth/core/errors";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { loginAction, signOutAction, changePasswordAction } from "./actions";

import { authMock } from "@/test/stubs/auth-config";

function passwordForm(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("loginAction", () => {
  it("translates an AuthError into a form error instead of throwing", async () => {
    authMock.signIn.mockRejectedValue(new AuthError("CredentialsSignin"));

    const result = await loginAction(undefined, passwordForm({ email: "a@b.com", password: "wrong" }));

    expect(result).toEqual({ error: "invalidCredentials" });
  });

  it("re-throws anything that isn't an AuthError", async () => {
    authMock.signIn.mockRejectedValue(new Error("boom"));

    await expect(loginAction(undefined, passwordForm({ email: "a@b.com", password: "x" }))).rejects.toThrow("boom");
  });
});

describe("signOutAction", () => {
  it("signs the caller out, redirecting to the login page", async () => {
    authMock.signOut.mockResolvedValue(undefined);

    await signOutAction();

    expect(authMock.signOut).toHaveBeenCalledWith({ redirectTo: "/admin/login" });
  });
});

describe("changePasswordAction", () => {
  it("rejects an unauthenticated caller", async () => {
    authMock.auth.mockResolvedValue(null);

    const result = await changePasswordAction(
      undefined,
      passwordForm({ newPassword: "longenough", confirmPassword: "longenough" })
    );

    expect(result).toEqual({ error: "notAuthenticated" });
  });

  it("rejects mismatched passwords", async () => {
    authMock.auth.mockResolvedValue({ user: { id: "user_1" } });

    const result = await changePasswordAction(
      undefined,
      passwordForm({ newPassword: "longenough", confirmPassword: "different" })
    );

    expect(result).toEqual({ error: "passwordsDontMatch" });
  });

  it("rejects a password shorter than 8 characters", async () => {
    authMock.auth.mockResolvedValue({ user: { id: "user_1" } });

    const result = await changePasswordAction(undefined, passwordForm({ newPassword: "short", confirmPassword: "short" }));

    expect(result).toEqual({ error: "passwordTooShort" });
  });

  it("updates the password, clears mustChangePassword, and signs out", async () => {
    const user = await prisma.user.create({
      data: { email: "mesero@marea.test", passwordHash: await hashPassword("old"), mustChangePassword: true },
    });
    authMock.auth.mockResolvedValue({ user: { id: user.id } });
    authMock.signOut.mockResolvedValue(undefined);

    await changePasswordAction(
      undefined,
      passwordForm({ newPassword: "brandnewpassword", confirmPassword: "brandnewpassword" })
    );

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(updated.mustChangePassword).toBe(false);
    expect(updated.passwordHash).not.toBe(user.passwordHash);
    expect(authMock.signOut).toHaveBeenCalledWith({ redirectTo: "/admin/login" });
  });
});
