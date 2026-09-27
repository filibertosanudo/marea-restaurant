"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { verifyEmailAction } from "@/lib/auth/signup-actions";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";

export function VerifyEmailForm({ dict, token }: { dict: AdminDictionary; token: string }) {
  const [state, action, pending] = useActionState(verifyEmailAction, undefined);

  if (state && "success" in state) {
    return (
      <div className="flex flex-col gap-md text-center">
        <h2 className="font-display text-[18px] font-semibold text-on-surface">
          {dict.auth.verifyEmailSuccessTitle}
        </h2>
        <p className="text-[13px] text-on-surface-muted">{dict.auth.verifyEmailSuccessBody}</p>
        <a href="/admin/login" className="text-[13px] font-medium text-primary underline">
          {dict.auth.backToLogin}
        </a>
      </div>
    );
  }

  if (state?.error) {
    return (
      <div className="flex flex-col gap-md text-center">
        <p role="alert" aria-live="polite" className="text-[13px] text-error">
          {dict.auth.invalidOrExpiredToken}
        </p>
        <a href="/admin/signup" className="text-[13px] font-medium text-primary underline">
          {dict.auth.backToSignup}
        </a>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-md">
      <input type="hidden" name="token" value={token} />
      <Button type="submit" disabled={pending} className="w-full">
        {dict.auth.verifyEmailButton}
      </Button>
    </form>
  );
}
