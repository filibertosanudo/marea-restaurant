"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/dto/money";
import { AmountBreakdown } from "@/components/admin/AmountBreakdown";
import { PaymentMethodChoice, type PaymentMethod } from "./PaymentMethodChoice";
import { CardPaymentPanel } from "./CardPaymentPanel";
import type { OrderDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";

export type TrackedPaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "REQUIRES_ACTION"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | null;

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

  if (!acceptsOnlinePayment) {
    return (
      <PaymentCard title={dict.paymentSectionTitle}>
        <p className="text-[12.5px] text-on-surface-muted">{dict.payAtRegisterOnlyBody}</p>
      </PaymentCard>
    );
  }

  return (
    <PaymentCard title={dict.paymentSectionTitle}>
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
