"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { changePasswordAction } from "@/lib/auth/actions";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";

export function ChangePasswordForm({ dict }: { dict: AdminDictionary }) {
  const [state, action, pending] = useActionState(
    changePasswordAction,
    undefined
  );

  const errorMessage =
    state?.error === "passwordTooShort"
      ? dict.auth.passwordTooShort
      : state?.error === "passwordsDontMatch"
        ? dict.auth.passwordsDontMatch
        : undefined;

  return (
    <form action={action} className="flex flex-col gap-md">
      <Input
        id="newPassword"
        name="newPassword"
        type="password"
        label={dict.auth.newPassword}
        autoComplete="new-password"
        required
        minLength={8}
      />
      <Input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label={dict.auth.confirmPassword}
        autoComplete="new-password"
        required
        minLength={8}
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
