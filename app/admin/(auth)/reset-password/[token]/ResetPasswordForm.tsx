"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { resetPasswordAction } from "@/lib/auth/reset-actions";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";

export function ResetPasswordForm({ dict, token }: { dict: AdminDictionary; token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);

  if (state && "success" in state) {
    return (
      <div className="flex flex-col gap-md text-center">
        <h2 className="font-display text-[18px] font-semibold text-on-surface">
          {dict.auth.resetPasswordSuccessTitle}
        </h2>
        <p className="text-[13px] text-on-surface-muted">{dict.auth.resetPasswordSuccessBody}</p>
        <a href="/admin/login" className="text-[13px] font-medium text-primary underline">
          {dict.auth.backToLogin}
        </a>
      </div>
    );
  }

  const errorMessage =
    state?.error === "passwordTooShort"
      ? dict.auth.passwordTooShort
      : state?.error === "passwordTooWeak"
        ? dict.auth.passwordTooWeak
        : state?.error === "passwordsDontMatch"
          ? dict.auth.passwordsDontMatch
          : state?.error === "invalidOrExpiredToken"
            ? dict.auth.invalidOrExpiredToken
            : undefined;

  return (
    <form action={action} className="flex flex-col gap-md">
      <input type="hidden" name="token" value={token} />
      <Input
        id="newPassword"
        name="newPassword"
        type="password"
        label={dict.auth.newPassword}
        autoComplete="new-password"
        required
        minLength={12}
      />
      <Input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label={dict.auth.confirmPassword}
        autoComplete="new-password"
        required
        minLength={12}
      />

      {errorMessage && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md bg-error/10 px-md py-[10px] text-[13px] text-error"
        >
          {errorMessage}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {dict.auth.updatePassword}
      </Button>
    </form>
  );
}
