"use client";

import { useEffect, useRef, useState } from "react";
import type { Stripe as StripeJS, StripeElements, StripePaymentElement } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripe/browser";

export type CardPaymentStatus = "form" | "processing" | "requires_action" | "failed" | "succeeded";

function Spinner() {
  return (
    <svg
      className="h-5 w-5 animate-spin text-primary"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** rgb(r g b) CSS custom properties, per styles/tokens.css — read from the resolved page (light/dark, whichever is active) since Stripe Elements mounts in an iframe and can't see the parent's CSS variables directly. */
function readColorToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? `rgb(${raw.replace(/\s+/g, ", ")})` : fallback;
}

/**
 * Everything after the customer picks "pay with card": mounts a real
 * Stripe Payment Element into the clientSecret Fase 4's
 * createPaymentIntentAction hands back, and the four states that flow can
 * land in.
 *
 * confirmPayment resolving without an error does NOT mean the payment
 * succeeded — the webhook is the only source of truth (see
 * app/api/webhooks/stripe/route.ts), so this never sets its own status to
 * "succeeded" from that resolution. It stays on "processing"; the tracking
 * page's SSE listener (OrderStreamListener) refreshes once the webhook
 * updates the order's real payment status, and PaymentSection's own
 * top-level branch takes over from there.
 *
 * `requires_action`/`succeeded` stay as render branches for design
 * completeness (a future manual-confirmation flow could drive them), but
 * `redirect: "if_required"` has Stripe show its own 3D Secure challenge
 * inline as part of confirmPayment's own UI — this component never gets a
 * mid-flight callback to switch into `requires_action` itself.
 */
export function CardPaymentPanel({
  clientSecret,
  amountLabel,
  onSwitchToCash,
  dict,
}: {
  clientSecret: string;
  amountLabel: string;
  onSwitchToCash?: () => void;
  dict: {
    cardFieldLabel: string;
    cardFieldPlaceholder: string;
    payLabel: string;
    /** Shown under the submit button only while the Payment Element is still loading (button disabled). */
    disabledCaption: string;
    processingTitle: string;
    processingBody: string;
    requiresActionTitle: string;
    requiresActionBody: string;
    failedTitle: string;
    failedBodyFallback: string;
    retry: string;
    switchToCash: string;
    succeededTitle: string;
    succeededBody: string;
  };
}) {
  const [status, setStatus] = useState<CardPaymentStatus>("form");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [elementReady, setElementReady] = useState(false);
  const mountNodeRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<StripeJS | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentElementRef = useRef<StripePaymentElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElementReady(false);

    getStripe().then((stripeInstance) => {
      if (cancelled || !stripeInstance || !mountNodeRef.current) return;
      stripeRef.current = stripeInstance;

      const elements = stripeInstance.elements({
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: {
            colorPrimary: readColorToken("--color-primary", "#1B367B"),
            colorBackground: readColorToken("--color-surface", "#FFFFFF"),
            colorText: readColorToken("--color-on-surface", "#232C3B"),
            colorDanger: readColorToken("--color-error", "#C0392B"),
            fontFamily: "Poppins, system-ui, sans-serif",
            borderRadius: "12px",
          },
        },
      });
      elementsRef.current = elements;

      const paymentElement = elements.create("payment");
      paymentElementRef.current = paymentElement;
      paymentElement.mount(mountNodeRef.current);
      paymentElement.on("ready", () => {
        if (!cancelled) setElementReady(true);
      });
    });

    return () => {
      cancelled = true;
      // Unmounts the iframe before the next effect run (or this
      // component's own unmount) creates a new one — without this, a
      // clientSecret change while mounted would stack a second Payment
      // Element into the same DOM node instead of replacing the first.
      paymentElementRef.current?.unmount();
      paymentElementRef.current = null;
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, [clientSecret]);

  async function handleSubmit() {
    const stripeInstance = stripeRef.current;
    const elements = elementsRef.current;
    if (!stripeInstance || !elements) return;

    setErrorMessage(undefined);
    setStatus("processing");

    const { error } = await stripeInstance.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (error) {
      setErrorMessage(error.message);
      setStatus("failed");
    }
    // No error: stays on "processing" — see the doc comment above.
  }

  function handleRetry() {
    setErrorMessage(undefined);
    setStatus("form");
  }

  if (status === "processing") {
    return (
      <div className="flex flex-col items-center gap-sm rounded-lg border border-border/25 bg-surface p-lg text-center">
        <Spinner />
        <p className="text-[14px] font-semibold text-on-surface">{dict.processingTitle}</p>
        <p className="text-[12.5px] text-on-surface-muted">{dict.processingBody}</p>
      </div>
    );
  }

  if (status === "requires_action") {
    return (
      <div className="flex flex-col items-center gap-sm rounded-lg border border-warning/30 bg-warning/8 p-lg text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-warning/16 text-warning">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="9" width="16" height="11" rx="2" />
            <path d="M8 9V6a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
        <p className="text-[14px] font-semibold text-on-surface">{dict.requiresActionTitle}</p>
        <p className="text-[12.5px] text-on-surface-muted">{dict.requiresActionBody}</p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col gap-sm rounded-lg border border-error/30 bg-error/8 p-lg">
        <div className="flex items-start gap-sm">
          <div className="mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-error/16 text-error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-error">{dict.failedTitle}</p>
            <p className="mt-[2px] text-[12.5px] leading-snug text-on-surface-muted">
              {errorMessage || dict.failedBodyFallback}
            </p>
          </div>
        </div>
        <div className="flex gap-sm">
          <button
            type="button"
            onClick={handleRetry}
            className="flex-1 rounded-full bg-primary py-[12px] text-[13.5px] font-semibold text-on-primary transition-colors hover:bg-primary-hover"
          >
            {dict.retry}
          </button>
          <button
            type="button"
            onClick={onSwitchToCash}
            className="flex-1 rounded-full border border-border/40 py-[12px] text-[13.5px] font-semibold text-on-surface transition-colors hover:bg-surface-subtle"
          >
            {dict.switchToCash}
          </button>
        </div>
      </div>
    );
  }

  if (status === "succeeded") {
    return (
      <div className="flex flex-col items-center gap-sm rounded-lg border border-success/30 bg-success/8 p-lg text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success/16 text-success">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-[14px] font-semibold text-on-surface">{dict.succeededTitle}</p>
        <p className="text-[12.5px] text-on-surface-muted">{dict.succeededBody}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-sm">
      <div>
        <span className="mb-[6px] block text-[13px] font-medium text-on-surface">
          {dict.cardFieldLabel}
        </span>
        <div ref={mountNodeRef} aria-label={dict.cardFieldPlaceholder} />
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!elementReady}
        className="mt-[4px] w-full rounded-full bg-primary py-[15px] text-[14.5px] font-semibold text-on-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {dict.payLabel.replace("{amount}", amountLabel)}
      </button>
      {!elementReady && <p className="text-center text-[11.5px] text-on-surface-muted">{dict.disabledCaption}</p>}
    </div>
  );
}
