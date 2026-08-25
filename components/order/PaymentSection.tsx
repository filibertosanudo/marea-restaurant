"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/dto/money";
import { AmountBreakdown } from "@/components/admin/AmountBreakdown";
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
 * "which method did they pick" and "what state is the card flow in", built
 * from the presentational PaymentMethodChoice/CardPaymentPanel. Neither of
 * those knows about the other; this is the one place that does.
 *
 * `acceptsOnlinePayment=false` (or a Stripe PaymentIntent action that
 * doesn't exist yet, in this phase) collapses straight to the pay-at-
 * register message — no dead-end choice screen for an option that isn't
 * live. Once Fase 4 wires a real onSubmit into CardPaymentPanel, choosing
 * "pay now" here starts driving `cardStatus` from Stripe's own callbacks
 * instead of staying parked on "form".
 */
export function PaymentSection({
  paymentStatus,
  total,
  currency,
  lang,
  acceptsOnlinePayment,
  dict,
}: {
  paymentStatus: TrackedPaymentStatus;
  total: string;
  currency: string;
  lang: Lang;
  acceptsOnlinePayment: boolean;
  dict: OrderDictionary;
}) {
  const [method, setMethod] = useState<PaymentMethod | null>(null);

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
  // second card charge once Fase 4 makes the choice live.
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
        cardTitle={dict.payCardTitle}
        cardBody={dict.payCardBody}
        cashTitle={dict.payCashTitle}
        cashBody={dict.payCashBody}
      />

      {method === "CARD" && (
        <div className="mt-md">
          <CardPaymentPanel
            status="form"
            amountLabel={formatMoney(total, currency, lang)}
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
