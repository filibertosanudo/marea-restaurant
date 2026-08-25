"use client";

import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/dto/money";
import { getOrderPaymentDetailAction } from "@/lib/orders/payment-actions";
import type { OrderPaymentDetailDTO } from "@/lib/orders/dto";
import type { AdminDictionary } from "@/lib/i18n/dictionaries";
import type { Lang } from "@/lib/i18n/lang";
import { Drawer } from "./Drawer";
import { AmountBreakdown } from "./AmountBreakdown";
import { PaymentStatusPill, type PaymentStatusValue } from "./PaymentStatusPill";
import { RefundForm, type RefundMode } from "./RefundForm";

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
  const [refundMode, setRefundMode] = useState<RefundMode>("FULL");
  const [partialAmount, setPartialAmount] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    // Resetting for the order this drawer is now fetching — not
    // synchronizing with an external system on every render, just clearing
    // stale state from whichever order the drawer showed last.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setLoadError(false);
    setDetail(null);
    setRefundMode("FULL");
    setPartialAmount("");
    setReason("");
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
                      <span>{new Date(payment.createdAt).toLocaleString(lang === "es" ? "es-MX" : "en-US")}</span>
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
              currency={detail.currency}
              locale={lang}
              refundableAmount={detail.refundableTotal}
              mode={refundMode}
              onModeChange={setRefundMode}
              partialAmount={partialAmount}
              onPartialAmountChange={setPartialAmount}
              reason={reason}
              onReasonChange={setReason}
              dict={{
                title: dict.refundTitle,
                fullLabel: dict.refundFull,
                partialLabel: dict.refundPartial,
                partialAmountLabel: dict.refundPartialAmountLabel,
                reasonLabel: dict.refundReasonLabel,
                reasonPlaceholder: dict.refundReasonPlaceholder,
                reasonRequired: dict.refundReasonRequired,
                submitLabel: dict.refundSubmit,
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
