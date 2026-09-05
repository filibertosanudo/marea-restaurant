"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { requestPasswordResetAction } from "@/lib/auth/reset-actions";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";

export function ForgotPasswordForm({ dict }: { dict: AdminDictionary }) {
  const [state, action, pending] = useActionState(requestPasswordResetAction, undefined);

  if (state?.submitted) {
    return (
      <div className="flex flex-col gap-md text-center">
        <h2 className="font-display text-[18px] font-semibold text-on-surface">
          {dict.auth.resetLinkSentTitle}
        </h2>
        <p className="text-[13px] text-on-surface-muted">{dict.auth.resetLinkSentBody}</p>
        <a href="/admin/login" className="text-[13px] font-medium text-primary underline">
          {dict.auth.backToLogin}
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-md">
      <Input
        id="email"
        name="email"
        type="email"
        label={dict.auth.email}
        autoComplete="email"
        required
      />

      {state?.error && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md bg-error/10 px-md py-[10px] text-[13px] text-error"
        >
          {dict.auth.invalidEmail}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {dict.auth.sendResetLink}
      </Button>
    </form>
  );
}
