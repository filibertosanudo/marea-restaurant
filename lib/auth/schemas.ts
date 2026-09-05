import { z } from "zod";
import { MIN_PASSWORD_LENGTH, MIN_PASSWORD_SCORE, passwordScore } from "@/lib/auth/password-strength";

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

// Shared by changePasswordSchema and resetPasswordSchema — both need "a
// strong new password, twice" and nothing else differs between them.
const newPasswordShape = {
  newPassword: z
    .string()
    .min(MIN_PASSWORD_LENGTH)
    .superRefine((value, ctx) => {
      if (passwordScore(value) < MIN_PASSWORD_SCORE) {
        ctx.addIssue({ code: "custom", message: "tooWeak" });
      }
    }),
  confirmPassword: z.string().min(MIN_PASSWORD_LENGTH),
};

function requireMatchingPasswords(data: { newPassword: string; confirmPassword: string }, ctx: z.RefinementCtx) {
  if (data.newPassword !== data.confirmPassword) {
    ctx.addIssue({ code: "custom", message: "Passwords don't match", path: ["confirmPassword"] });
  }
}

export const changePasswordSchema = z
  .object({
    // Only checked against the database when the caller isn't on a
    // must-change (temporary) password — see changePasswordAction.
    // .nullish(), not .optional(): FormData.get() returns null (not
    // undefined) for a field the form never sent.
    currentPassword: z.string().nullish(),
    ...newPasswordShape,
  })
  .superRefine(requireMatchingPasswords);

export const requestPasswordResetSchema = z.object({
  email: z.email(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    ...newPasswordShape,
  })
  .superRefine(requireMatchingPasswords);
