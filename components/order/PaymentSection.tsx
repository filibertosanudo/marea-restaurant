"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/dto/money";
import { AmountBreakdown } from "@/components/admin/AmountBreakdown";
import { createPaymentIntentAction } from "@/lib/payments/stripe-actions";
import { PaymentMethodChoice, type PaymentMethod } from "./PaymentMethodChoice";
import { CardPaymentPanel } from "./CardPaymentPanel";
import type { OrderDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import type { TrackedOrderDTO } from "@/lib/orders/dto";

// Derived from the DTO's own field, not hand-rolled — a new PaymentStatus
// enum value then shows up here automatically instead of silently falling
// through every branch below to the generic "choose a method" screen.
export type TrackedPaymentStatus = TrackedOrderDTO["paymentStatus"];

/**
 * The payment block on the order-tracking page — the container that owns
 * "which method did they pick" and, once CARD is picked, fetching the
 * PaymentIntent's clientSecret before CardPaymentPanel can mount anything.
 * Neither PaymentMethodChoice nor CardPaymentPanel knows about the other;
 * this is the one place that does.
 *
 * `acceptsOnlinePayment=false` collapses straight to the pay-at-register
 * message — no dead-end choice screen for an option that isn't live.
 */
export function PaymentSection({
  paymentStatus,
  total,
  currency,
  lang,
  acceptsOnlinePayment,
  publicToken,
  dict,
}: {
  paymentStatus: TrackedPaymentStatus;
  total: string;
  currency: string;
  lang: Lang;
  acceptsOnlinePayment: boolean;
  publicToken: string;
  dict: OrderDictionary;
}) {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [intentError, setIntentError] = useState<string | null>(null);
  const [loadingIntent, setLoadingIntent] = useState(false);

  useEffect(() => {
    if (method !== "CARD" || clientSecret || loadingIntent) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingIntent(true);
    setIntentError(null);
    createPaymentIntentAction(publicToken).then((result) => {
      if (cancelled) return;
      setLoadingIntent(false);
      if (result.ok) {
        setClientSecret(result.clientSecret);
      } else {
        setIntentError(dict.cardIntentError);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [method, clientSecret, loadingIntent, publicToken, dict.cardIntentError]);

  if (paymentStatus === "SUCCEEDED") {
    return (
      <PaymentCard title={dict.paymentSectionTitle}>
        <p className="mb-sm text-[12.5px] text-on-surface-muted">{dict.paymentPaidBody}</p>
        <AmountBreakdown
          currency={currency}
          locale={lang}
          rows={[{ label: dict.amountPaid, value: total, emphasis: true }]}
        />
      </PaymentCard>
    );
  }

  // A guest whose order was refunded (or is mid-flight on a payment they
  // already started) must never see the "choose how to pay" screen again —
  // that reads as "you haven't paid" to someone who has, or invites a
  // second card charge.
  if (paymentStatus === "REFUNDED" || paymentStatus === "PARTIALLY_REFUNDED") {
    return (
      <PaymentCard title={dict.paymentSectionTitle}>
        <p className="text-[12.5px] text-on-surface-muted">{dict.paymentRefundedBody}</p>
      </PaymentCard>
    );
  }

  if (paymentStatus === "PROCESSING" || paymentStatus === "REQUIRES_ACTION") {
    return (
      <PaymentCard title={dict.paymentSectionTitle}>
        <p className="text-[12.5px] text-on-surface-muted">
          {paymentStatus === "PROCESSING" ? dict.cardProcessingBody : dict.cardRequiresActionBody}
        </p>
      </PaymentCard>
    );
  }

  if (!acceptsOnlinePayment) {
    return (
      <PaymentCard title={dict.paymentSectionTitle}>
        <p className="text-[12.5px] text-on-surface-muted">{dict.payAtRegisterOnlyBody}</p>
      </PaymentCard>
    );
  }

  return (
    <PaymentCard title={dict.paymentSectionTitle}>
      {paymentStatus === "FAILED" && (
        <p className="mb-sm text-[12px] font-medium text-error">{dict.paymentPriorAttemptFailed}</p>
      )}
      <PaymentMethodChoice
        value={method}
        onChange={setMethod}
        groupLabel={dict.choosePaymentMethod}
        cardTitle={dict.payCardTitle}
        cardBody={dict.payCardBody}
        cashTitle={dict.payCashTitle}
        cashBody={dict.payCashBody}
      />

      {method === "CARD" && (
        <div className="mt-md">
          {loadingIntent && (
            <p className="text-center text-[12.5px] text-on-surface-muted">{dict.cardIntentLoading}</p>
          )}

          {intentError && !loadingIntent && (
            <div className="flex flex-col gap-sm rounded-lg border border-error/30 bg-error/8 p-lg">
              <p className="text-[12.5px] text-error">{intentError}</p>
              <button
                type="button"
                onClick={() => setMethod("CASH_REGISTER")}
                className="rounded-full border border-border/40 py-[12px] text-[13.5px] font-semibold text-on-surface transition-colors hover:bg-surface-subtle"
              >
                {dict.cardSwitchToCash}
              </button>
            </div>
          )}

          {clientSecret && !loadingIntent && (
            <CardPaymentPanel
              clientSecret={clientSecret}
              amountLabel={formatMoney(total, currency, lang)}
              onSwitchToCash={() => setMethod("CASH_REGISTER")}
              dict={{
                cardFieldLabel: dict.cardFieldLabel,
                cardFieldPlaceholder: dict.cardFieldPlaceholder,
                payLabel: dict.payLabel,
                disabledCaption: dict.cardPaymentComingSoon,
                processingTitle: dict.cardProcessingTitle,
                processingBody: dict.cardProcessingBody,
                requiresActionTitle: dict.cardRequiresActionTitle,
                requiresActionBody: dict.cardRequiresActionBody,
                failedTitle: dict.cardFailedTitle,
                failedBodyFallback: dict.cardFailedBodyFallback,
                retry: dict.cardRetry,
                switchToCash: dict.cardSwitchToCash,
                succeededTitle: dict.cardSucceededTitle,
                succeededBody: dict.cardSucceededBody,
              }}
            />
          )}
        </div>
      )}

      {method === "CASH_REGISTER" && (
        <p className="mt-md text-[12.5px] text-on-surface-muted">{dict.cashChosenConfirm}</p>
      )}
    </PaymentCard>
  );
}

function PaymentCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[360px] rounded-lg bg-surface p-lg text-left">
      <h2 className="mb-sm font-display text-[15px] font-semibold text-on-surface">{title}</h2>
      {children}
    </div>
  );
}
