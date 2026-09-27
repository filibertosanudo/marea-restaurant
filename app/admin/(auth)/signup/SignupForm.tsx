"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { signupAction } from "@/lib/auth/signup-actions";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";

export function SignupForm({ dict, renderedAt }: { dict: AdminDictionary; renderedAt: number }) {
  const [state, action, pending] = useActionState(signupAction, undefined);

  if (state?.submitted) {
    return (
      <div className="flex flex-col gap-md text-center">
        <h2 className="font-display text-[18px] font-semibold text-on-surface">
          {dict.auth.signupSuccessTitle}
        </h2>
        <p className="text-[13px] text-on-surface-muted">{dict.auth.signupSuccessBody}</p>
      </div>
    );
  }

  const fieldErrors = state?.submitted === false ? state.fieldErrors : undefined;

  return (
    <form action={action} className="flex flex-col gap-md">
      {/* Honeypot: real users never see or fill this. Not aria-hidden — a
          screen reader announcing an empty, oddly-labeled field is exactly
          the kind of thing that would make a real person fill it in. */}
      <div className="absolute -left-[9999px]" aria-hidden="false">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="renderedAt" value={renderedAt} />

      <Input
        id="businessName"
        name="businessName"
        type="text"
        label={dict.auth.signupBusinessName}
        autoComplete="organization"
        required
        maxLength={120}
      />
      {fieldErrors?.businessName && <p className="text-[12px] text-error">{fieldErrors.businessName}</p>}

      <Input
        id="slug"
        name="slug"
        type="text"
        label={dict.auth.signupSlug}
        autoComplete="off"
        required
        maxLength={32}
      />
      <p className="text-[12px] text-on-surface-muted">{dict.auth.signupSlugHint}</p>
      {fieldErrors?.slug && <p className="text-[12px] text-error">{fieldErrors.slug}</p>}

      <Input
        id="name"
        name="name"
        type="text"
        label={dict.auth.signupYourName}
        autoComplete="name"
        required
        maxLength={120}
      />
      {fieldErrors?.name && <p className="text-[12px] text-error">{fieldErrors.name}</p>}

      <Input id="email" name="email" type="email" label={dict.auth.email} autoComplete="email" required />
      {fieldErrors?.email && <p className="text-[12px] text-error">{fieldErrors.email}</p>}

      <Input
        id="password"
        name="password"
        type="password"
        label={dict.auth.password}
        autoComplete="new-password"
        required
        minLength={12}
      />
      {fieldErrors?.password && <p className="text-[12px] text-error">{fieldErrors.password}</p>}

      <Input
        id="confirmPassword"
        name="confirmPassword"
        type="password"
        label={dict.auth.confirmPassword}
        autoComplete="new-password"
        required
        minLength={12}
      />
      {fieldErrors?.confirmPassword && <p className="text-[12px] text-error">{fieldErrors.confirmPassword}</p>}

      {state?.submitted === false && state.error === "rate_limited" && (
        <p role="alert" aria-live="polite" className="rounded-md bg-error/10 px-md py-[10px] text-[13px] text-error">
          {dict.auth.signupRateLimited}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {dict.auth.signupSubmit}
      </Button>
    </form>
  );
}
