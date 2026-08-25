import { notFound } from "next/navigation";
import { getCurrentBusiness } from "@/lib/business";
import { getOrderByPublicToken } from "@/lib/orders/queries";
import { toTrackedOrderDTO } from "@/lib/orders/dto";
import { getOrderLang } from "@/lib/i18n/cookie";
import { getOrderDictionary } from "@/lib/i18n/dictionaries";
import { formatMoney } from "@/lib/dto/money";
import { StatusStepper } from "@/components/order/StatusStepper";
import { OrderStreamListener } from "@/components/order/OrderStreamListener";
import { PaymentSection } from "@/components/order/PaymentSection";
import type { OrderDictionary } from "@/lib/i18n/dictionaries";

const MESSAGE_BY_STATUS: Record<string, { title: keyof OrderDictionary; sub: keyof OrderDictionary }> = {
  PENDING: { title: "trackingMessagePending", sub: "trackingSubPending" },
  PREPARING: { title: "trackingMessagePreparing", sub: "trackingSubPreparing" },
  READY: { title: "trackingMessageReady", sub: "trackingSubReady" },
  DELIVERED: { title: "trackingMessageDelivered", sub: "trackingSubDelivered" },
};

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const business = await getCurrentBusiness();
  const lang = await getOrderLang(business.defaultLocale === "en" ? "en" : "es");
  const dict = getOrderDictionary(lang);

  const raw = await getOrderByPublicToken(business.id, publicToken);
  if (!raw) notFound();

  const order = toTrackedOrderDTO(raw);
  const isCancelled = order.status === "CANCELLED";
  const isTerminal = isCancelled || order.status === "DELIVERED";

  return (
    <div className="flex min-h-screen flex-col items-center bg-surface-subtle px-lg pb-lg pt-[40px] text-center">
      {!isTerminal && <OrderStreamListener publicToken={publicToken} />}
      <div className="mb-[36px] flex items-center gap-[7px] opacity-70">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary font-display text-[10px] font-bold text-on-primary">
          M
        </span>
        <span className="font-display text-[12px] font-semibold tracking-wide text-on-surface">
          {dict.brand.toUpperCase()}
        </span>
      </div>

      <p className="mb-[6px] text-[11.5px] font-semibold uppercase tracking-wide text-on-surface-muted">
        {dict.yourOrder}
      </p>
      <h1 className="mb-lg text-balance font-display text-[44px] font-bold text-on-surface">
        {order.orderNumber}
      </h1>

      {!isCancelled && (
        <div className="mb-[30px] w-full max-w-[360px]">
          <StatusStepper
            status={order.status as "PENDING" | "PREPARING" | "READY" | "DELIVERED"}
            labels={{
              PENDING: dict.statusPending,
              PREPARING: dict.statusPreparing,
              READY: dict.statusReady,
              DELIVERED: dict.statusDelivered,
            }}
          />
        </div>
      )}

      <div className="mb-[6px]">
        <h2 className="mb-[8px] text-balance font-display text-[21px] font-semibold text-on-surface">
          {isCancelled
            ? dict.trackingMessageCancelled
            : dict[MESSAGE_BY_STATUS[order.status]?.title ?? "trackingMessagePending"]}
        </h2>
        <p className="text-[13.5px] leading-relaxed text-on-surface-muted">
          {isCancelled
            ? order.cancellationReason ?? ""
            : dict[MESSAGE_BY_STATUS[order.status]?.sub ?? "trackingSubPending"]}
        </p>
      </div>

      <div className="flex-1" />

      <div className="w-full max-w-[360px] rounded-lg bg-surface p-lg text-left">
        <div className="mb-sm flex justify-between text-[13px] font-semibold text-on-surface">
          <span>{order.tableLabel ? dict.table.replace("{code}", order.tableLabel) : dict.takeaway}</span>
          <span className="tabular-nums">{formatMoney(order.total, order.currency, lang)}</span>
        </div>
        <ul className="flex flex-col gap-[3px]">
          {order.items.map((item) => (
            <li key={item.id} className="text-[12.5px] text-on-surface-muted">
              {item.quantity}× {item.name}
              {item.modifiers.length > 0 ? ` (${item.modifiers.join(", ")})` : ""}
            </li>
          ))}
        </ul>
      </div>

      {!isCancelled && (
        <div className="mt-md w-full max-w-[360px]">
          <PaymentSection
            paymentStatus={order.paymentStatus}
            total={order.total}
            currency={order.currency}
            lang={lang}
            acceptsOnlinePayment={business.acceptsOnlinePayment}
            dict={dict}
          />
        </div>
      )}
    </div>
  );
}
