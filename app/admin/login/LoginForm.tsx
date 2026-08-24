"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { loginAction } from "@/lib/auth/actions";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";

export function LoginForm({ dict }: { dict: AdminDictionary }) {
  const [state, action, pending] = useActionState(loginAction, undefined);

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
      <Input
        id="password"
        name="password"
        type="password"
        label={dict.auth.password}
        autoComplete="current-password"
        required
      />

      {state?.error && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md bg-error/10 px-md py-[10px] text-[13px] text-error"
        >
          {dict.auth.invalidCredentials}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? dict.auth.signingIn : dict.auth.signIn}
      </Button>
    </form>
  );
}
