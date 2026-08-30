"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Stripe as StripeJS, StripeElements, StripePaymentElement } from "@stripe/stripe-js";
import { getStripe } from "@/lib/stripe/browser";

// If the tracking page's SSE connection drops right after a successful
// confirm (flaky mobile network, a proxy killing long-lived connections),
// nothing ever nudges this component out of "processing" — the webhook
// already updated the DB, there's just no push telling this tab. After
// this long, offer a manual refresh instead of leaving the guest staring
// at a spinner forever.
const STUCK_PROCESSING_MS = 20_000;

export type CardPaymentStatus = "form" | "processing" | "requires_action" | "failed";

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
 * `requires_action` stays as a render branch for design completeness (a
 * future manual-confirmation flow could drive it), but `redirect:
 * "if_required"` has Stripe show its own 3D Secure challenge inline as part
 * of confirmPayment's own UI — this component never gets a mid-flight
 * callback to switch into `requires_action` itself. There's deliberately no
 * "succeeded" branch here: nothing in this component ever sets that status
 * (see the paragraph above), so it can only ever be reached by leaving the
 * order in a state its own confirmPayment call never produces — the
 * webhook-driven success screen lives one level up, in PaymentSection.
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
    stillWaitingRefresh: string;
    requiresActionTitle: string;
    requiresActionBody: string;
    failedTitle: string;
    failedBodyFallback: string;
    retry: string;
    switchToCash: string;
  };
}) {
  const [status, setStatus] = useState<CardPaymentStatus>("form");
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [elementReady, setElementReady] = useState(false);
  const [stuckProcessing, setStuckProcessing] = useState(false);
  const mountNodeRef = useRef<HTMLDivElement | null>(null);
  const stripeRef = useRef<StripeJS | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const paymentElementRef = useRef<StripePaymentElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (status !== "processing") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStuckProcessing(false);
      return;
    }
    const timer = setTimeout(() => setStuckProcessing(true), STUCK_PROCESSING_MS);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    // The mount node only exists in the DOM while status === "form" (every
    // other status is its own early-return branch below). Without this
    // guard, retrying after a failed payment flips status back to "form"
    // and React renders a brand-new, empty mount div that this effect never
    // re-runs for — the guest sees the "Pagar" button with no card field
    // above it. Depending on `status` here means a failed→form retry reruns
    // this same mount logic against that new node instead of relying on a
    // stale ref into a div React already discarded.
    if (status !== "form") return;

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
      // Unmounts the iframe before the next effect run (a clientSecret
      // change, or leaving and re-entering "form") creates a new one —
      // without this, either case would stack a second Payment Element
      // into the same DOM node instead of replacing the first.
      paymentElementRef.current?.unmount();
      paymentElementRef.current = null;
      elementsRef.current = null;
      stripeRef.current = null;
    };
  }, [clientSecret, status]);

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
        {stuckProcessing && (
          <button
            type="button"
            onClick={() => router.refresh()}
            className="mt-[4px] text-[12.5px] font-semibold text-primary underline underline-offset-2"
          >
            {dict.stillWaitingRefresh}
          </button>
        )}
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
