"use server";

import { AuthError } from "next-auth";
import { signIn, signOut, auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DUMMY_HASH, hashPassword, verifyPassword } from "@/lib/auth/password";
import { changePasswordSchema } from "@/lib/auth/schemas";

export type LoginState = { error?: string } | undefined;

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/admin",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "invalidCredentials" };
    }
    throw error;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/admin/login" });
}

export type ChangePasswordState = { error?: string } | undefined;

export async function changePasswordAction(
  _prevState: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "notAuthenticated" };
  }

  // Read fresh from the database rather than trusting the session's
  // mustChangePassword — the JWT can be up to REVALIDATE_INTERVAL_MS stale.
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return { error: "notAuthenticated" };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const newPasswordIssue = parsed.error.issues.find((issue) => issue.path[0] === "newPassword");
    if (newPasswordIssue) {
      return { error: newPasswordIssue.code === "too_small" ? "passwordTooShort" : "passwordTooWeak" };
    }
    return { error: "passwordsDontMatch" };
  }

  // Temporary passwords are dictated by an admin and typed once, under
  // duress of a forced first login — asking for them again is friction with
  // no security gain. Anyone else must prove they still hold the account.
  if (!user.mustChangePassword) {
    const validCurrent = await verifyPassword(user.passwordHash ?? DUMMY_HASH, parsed.data.currentPassword ?? "");
    if (!validCurrent) {
      return { error: "invalidCurrentPassword" };
    }
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
  });

  await signOut({ redirectTo: "/admin/login" });
}
