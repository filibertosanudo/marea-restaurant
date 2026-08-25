"use client";

import { useEffect, useState, useTransition } from "react";
import { formatMoney, toIntlLocale } from "@/lib/dto/money";
import { getOrderPaymentDetailAction } from "@/lib/orders/payment-actions";
import { createRefundAction, type CreateRefundResult } from "@/lib/payments/refund-actions";
import type { OrderPaymentDetailDTO } from "@/lib/orders/dto";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { Drawer } from "./Drawer";
import { AmountBreakdown } from "./AmountBreakdown";
import { PaymentStatusPill, type PaymentStatusValue } from "./PaymentStatusPill";
import { RefundForm } from "./RefundForm";

const REFUND_ERROR_KEY = {
  not_found: "refundErrorGeneric",
  reason_required: "refundReasonRequired",
  nothing_refundable: "refundErrorNothingRefundable",
  amount_exceeds_refundable: "refundErrorAmountExceeds",
  try_again: "refundErrorGeneric",
} as const satisfies Record<Exclude<CreateRefundResult, { ok: true }>["error"], keyof AdminDictionary["payments"]>;

const STATUS_LABEL_KEY = {
  PENDING: "statusPending",
  PROCESSING: "statusProcessing",
  REQUIRES_ACTION: "statusRequiresAction",
  SUCCEEDED: "statusSucceeded",
  FAILED: "statusFailed",
  CANCELLED: "statusCancelled",
  REFUNDED: "statusRefunded",
  PARTIALLY_REFUNDED: "statusPartiallyRefunded",
} as const;

/**
 * Covers every value the PaymentStatus/RefundStatus enums can hold today —
 * but a new enum value from a future migration would otherwise fall
 * through STATUS_LABEL_KEY as `undefined` and crash the drawer on
 * `dict[undefined]`. Falling back to the raw status string keeps the row
 * readable (an unfamiliar label, not a blank screen) instead.
 */
function paymentStatusLabel(dict: AdminDictionary["payments"], status: string): string {
  const key = STATUS_LABEL_KEY[status as keyof typeof STATUS_LABEL_KEY];
  return key ? dict[key] : status;
}

/**
 * "Cobro en el tablero" — opened from a board card, this is where staff see
 * the full picture the compact card can't show: every payment attempt,
 * what's actually been paid (the sum of SUCCEEDED, not one payment's
 * status), and its refund history. The refund form itself only renders for
 * `canRefund` (BUSINESS_ADMIN+, per the permission matrix) and only when
 * there's something left to refund.
 *
 * Fetches on open rather than receiving data as a prop — most orders on a
 * board never get their drawer opened, so paying for every order's full
 * payment+refund history on every board render would be waste this module
 * doesn't need to carry.
 */
export function OrderPaymentDrawer({
  orderId,
  open,
  onClose,
  canRefund,
  lang,
  dict,
}: {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  canRefund: boolean;
  lang: Lang;
  dict: AdminDictionary["payments"];
}) {
  const [detail, setDetail] = useState<OrderPaymentDetailDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);
  const [refundPending, startRefundTransition] = useTransition();

  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    // Resetting for the order this drawer is now fetching — not
    // synchronizing with an external system on every render, just clearing
    // stale state from whichever order the drawer showed last. RefundForm's
    // own draft (mode/amount/reason) resets for free since it remounts
    // along with this new `detail`, so there's nothing of its to reset here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(false);
    setRefundError(null);
    setDetail(null);
    getOrderPaymentDetailAction(orderId)
      .then((result) => {
        if (cancelled) return;
        setDetail(result);
        setLoading(false);
      })
      .catch(() => {
        // A thrown requireRole/Prisma error otherwise leaves this stuck on
        // "Loading…" forever — the only way out being to close the drawer.
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  function handleRefundSubmit(refund: { mode: "FULL" | "PARTIAL"; amount: string; reason: string }) {
    if (!orderId) return;
    setRefundError(null);
    startRefundTransition(async () => {
      const result = await createRefundAction(orderId, refund);
      if (!result.ok) {
        setRefundError(dict[REFUND_ERROR_KEY[result.error]]);
        return;
      }
      // Re-fetch so the new PENDING Refund and updated refundableTotal show
      // up immediately — the webhook will later flip it to SUCCEEDED, at
      // which point closing and reopening (or the board's own revalidation)
      // picks that up the same way.
      const refreshed = await getOrderPaymentDetailAction(orderId);
      setDetail(refreshed);
    });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={dict.title.replace("{orderNumber}", detail?.orderNumber ?? "")}
    >
      {loading && <p className="text-[13px] text-on-surface-muted">{dict.loading}</p>}
      {!loading && loadError && <p className="text-[13px] text-error">{dict.loadError}</p>}
      {!loading && !loadError && !detail && (
        <p className="text-[13px] text-on-surface-muted">{dict.notFound}</p>
      )}

      {!loading && !loadError && detail && (
        <div className="flex flex-col gap-lg">
          <AmountBreakdown
            currency={detail.currency}
            locale={lang}
            rows={[
              { label: dict.amountTotal, value: detail.total, muted: true },
              { label: dict.amountPaid, value: detail.paidTotal, emphasis: true },
              ...(Number(detail.refundedTotal) > 0
                ? [{ label: dict.amountRefunded, value: detail.refundedTotal, muted: true }]
                : []),
            ]}
          />

          <div>
            <h4 className="mb-sm text-[12px] font-semibold uppercase tracking-wide text-on-surface-muted">
              {dict.historyTitle}
            </h4>
            {detail.payments.length === 0 ? (
              <p className="text-[12.5px] text-on-surface-muted">{dict.historyEmpty}</p>
            ) : (
              <ul className="flex flex-col gap-sm">
                {detail.payments.map((payment) => (
                  <li key={payment.id} className="rounded-sm border border-border/20 p-sm">
                    <div className="flex items-center justify-between gap-sm">
                      <span className="text-[12.5px] font-medium text-on-surface">
                        {payment.provider === "CASH_REGISTER"
                          ? dict.providerCash
                          : payment.paymentMethodBrand && payment.paymentMethodLast4
                            ? `${payment.paymentMethodBrand.toUpperCase()} •••• ${payment.paymentMethodLast4}`
                            : dict.providerCard}
                      </span>
                      <PaymentStatusPill
                        status={payment.status as PaymentStatusValue}
                        label={paymentStatusLabel(dict, payment.status)}
                      />
                    </div>
                    <div className="mt-[4px] flex items-center justify-between text-[12px] text-on-surface-muted">
                      <span>{new Date(payment.createdAt).toLocaleString(toIntlLocale(lang))}</span>
                      <span className="tabular-nums">{formatMoney(payment.amount, detail.currency, lang)}</span>
                    </div>
                    {payment.refunds.map((refund) => (
                      <div
                        key={refund.id}
                        className="mt-sm flex items-center justify-between gap-sm border-t border-border/15 pt-sm text-[12px]"
                      >
                        <span className="min-w-0 flex-1 text-on-surface-muted">
                          {dict.refundLabel}
                          {refund.reason ? ` — ${refund.reason}` : ""}
                        </span>
                        {/* Only a SUCCEEDED refund actually moved money — a
                            PENDING or FAILED one showing the same solid red
                            amount as a completed refund would read as
                            "already refunded" when it isn't, and refundedTotal
                            above deliberately excludes anything but SUCCEEDED. */}
                        {refund.status !== "SUCCEEDED" && (
                          <PaymentStatusPill
                            status={refund.status as PaymentStatusValue}
                            label={paymentStatusLabel(dict, refund.status)}
                          />
                        )}
                        <span
                          className={`shrink-0 tabular-nums ${
                            refund.status === "SUCCEEDED" ? "text-error" : "text-on-surface-muted"
                          }`}
                        >
                          -{formatMoney(refund.amount, detail.currency, lang)}
                        </span>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canRefund && Number(detail.refundableTotal) > 0 && (
            <RefundForm
              key={detail.orderId}
              currency={detail.currency}
              locale={lang}
              refundableAmount={detail.refundableTotal}
              onSubmit={handleRefundSubmit}
              pending={refundPending}
              serverError={refundError ?? undefined}
              dict={{
                title: dict.refundTitle,
                fullLabel: dict.refundFull,
                partialLabel: dict.refundPartial,
                partialAmountLabel: dict.refundPartialAmountLabel,
                reasonLabel: dict.refundReasonLabel,
                reasonPlaceholder: dict.refundReasonPlaceholder,
                reasonRequired: dict.refundReasonRequired,
                submitLabel: dict.refundSubmit,
                submittingLabel: dict.refundSubmitting,
                disabledCaption: dict.refundDisabledCaption,
                refundableLabel: dict.refundableLabel,
              }}
            />
          )}
        </div>
      )}
    </Drawer>
  );
}
