import { z } from "zod";
import { MIN_PASSWORD_LENGTH, MIN_PASSWORD_SCORE, passwordScore } from "@/lib/auth/password-strength";
import { validateSlug } from "@/lib/business-host";

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

// The password fields reuse newPasswordShape's rules under their own names
// (password/confirmPassword, not newPassword) — this is the only password
// the account will ever have had, not a replacement for an old one.
export const signupSchema = z
  .object({
    businessName: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .superRefine((value, ctx) => {
        const problem = validateSlug(value);
        if (problem) ctx.addIssue({ code: "custom", message: problem });
      }),
    name: z.string().trim().min(1).max(120),
    email: z.email(),
    password: newPasswordShape.newPassword,
    confirmPassword: newPasswordShape.confirmPassword,
    // Hidden field a real browser never fills; a bot's autofill often does.
    // Not surfaced as a validation error — see signupAction, which treats a
    // non-empty value as "pretend this succeeded" rather than telling the
    // filler anything was wrong.
    company: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({ code: "custom", message: "Passwords don't match", path: ["confirmPassword"] });
    }
  });
