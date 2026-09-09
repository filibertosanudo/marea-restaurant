import { z } from "zod";
import { MIN_PASSWORD_LENGTH, MIN_PASSWORD_SCORE, passwordScore } from "@/lib/auth/password-strength";

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const changePasswordSchema = z
  .object({
    // Only checked against the database when the caller isn't on a
    // must-change (temporary) password — see changePasswordAction.
    // .nullish(), not .optional(): FormData.get() returns null (not
    // undefined) for a field the form never sent.
    currentPassword: z.string().nullish(),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH)
      .superRefine((value, ctx) => {
        if (passwordScore(value) < MIN_PASSWORD_SCORE) {
          ctx.addIssue({ code: "custom", message: "tooWeak" });
        }
      }),
    confirmPassword: z.string().min(MIN_PASSWORD_LENGTH),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    error: "Passwords don't match",
    path: ["confirmPassword"],
  });
