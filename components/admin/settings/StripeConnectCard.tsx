"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import { Button } from "@/components/ui/Button";
import {
  refreshStripeAccountAction,
  startStripeOnboardingAction,
  type ConnectError,
} from "@/lib/payments/connect-actions";

type SettingsDict = AdminDictionary["settings"];
export type StripeCardState = {
  hasCountry: boolean;
  hasAccount: boolean;
  status: "ACTIVE" | "PENDING" | "RESTRICTED" | "UNSUPPORTED" | null;
  checkedAt: string | null;
  /** What the address asked for on arrival: "return" from Stripe, or "refresh" after an expired link. */
  arrival: "return" | "refresh" | null;
};

const statusKey = { ACTIVE: "active", PENDING: "pending", RESTRICTED: "restricted", UNSUPPORTED: "unsupported" } as const;

/**
 * Where a business connects its own Stripe account and sees what that account
 * can do. It never shows or accepts an account id: everything acts on the account
 * the server already holds for the signed-in business.
 */
export function StripeConnectCard({ dict, state, lang }: { dict: SettingsDict; state: StripeCardState; lang: string }) {
  const [error, setError] = useState<ConnectError | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const arrived = useRef(false);

  function connect() {
    setError(null);
    startTransition(async () => {
      const result = await startStripeOnboardingAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if ("url" in result) {
        window.location.assign(result.url);
        return;
      }
      router.refresh();
    });
  }

  function check() {
    setError(null);
    startTransition(async () => {
      const result = await refreshStripeAccountAction();
      if (!result.ok) setError(result.error);
      router.refresh();
    });
  }

  // Coming back from Stripe proves nothing about whether it was finished, so ask.
  // An expired link lands here too and gets a new one. Once, and then the address
  // is cleaned so a reload does not repeat it.
  useEffect(() => {
    if (arrived.current || !state.arrival) return;
    arrived.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    // Runs once on arrival; the state it sets is the result of a server call, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state.arrival === "return") check();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    else connect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusText = state.status ? dict.stripeStatuses[statusKey[state.status]] : null;
  const canStart = state.hasCountry && !pending;
  const checked = state.checkedAt
    ? new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", { dateStyle: "short", timeStyle: "short" }).format(new Date(state.checkedAt))
    : null;

  return (
    <div className="mb-md rounded-md border border-border bg-surface p-md">
      <h2 className="mb-[2px] text-[16px] font-semibold text-on-surface">{dict.stripeTitle}</h2>
      <p className="mb-md text-[12px] text-on-surface-muted">{dict.stripeLead}</p>

      {state.hasAccount && statusText && (
        <div className="mb-md rounded-sm bg-surface-subtle p-sm text-[13px] text-on-surface">
          <div className="font-medium">
            {dict.stripeStatusLabel}: {statusText.title}
          </div>
          <div className="mt-[2px] text-[12px] text-on-surface-muted">{statusText.body}</div>
          {checked && (
            <div className="mt-[4px] text-[11.5px] text-on-surface-muted">
              {dict.stripeCheckedAt} {checked}
            </div>
          )}
        </div>
      )}

      {!state.hasCountry && <p className="mb-md text-[12.5px] text-warning">{dict.stripeNeedsCountry}</p>}

      <div className="flex flex-wrap gap-sm">
        {state.status !== "ACTIVE" && (
          <Button type="button" onClick={connect} disabled={!canStart}>
            {pending ? dict.stripeWorking : state.hasAccount ? dict.stripeContinue : dict.stripeConnect}
          </Button>
        )}
        {state.hasAccount && (
          <Button type="button" variant="secondary" onClick={check} disabled={pending}>
            {dict.stripeCheck}
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-sm text-[12.5px] text-error">
          {dict.stripeErrors[error]}
        </p>
      )}
    </div>
  );
}
