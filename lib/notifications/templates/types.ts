import "server-only";
import type { Lang } from "@/lib/i18n/lang";

/** The three facts about the sending business every template's footer needs — never queried by a template itself; the worker fetches this once per job and passes it in. */
export type TemplateBusiness = {
  name: string;
  address: string | null;
  phone: string | null;
};

export type ReservationConfirmedPayload = {
  confirmationCode: string;
  partySize: number;
  /** Formatted in the business's own timezone at enqueue time — a template never resolves a timezone itself. */
  reservedForLabel: string;
  reservationUrl: string;
};

export type OrderLineSummary = { name: string; quantity: number; lineTotal: string };

export type OrderConfirmedPayload = {
  orderNumber: string;
  orderUrl: string;
  items: OrderLineSummary[];
  total: string;
  currency: string;
};

export type OrderStatusPayload = {
  orderNumber: string;
  orderUrl: string;
};

export type OrderCancelledPayload = {
  orderNumber: string;
  orderUrl: string;
  reason: string;
};

export type PasswordResetPayload = {
  resetUrl: string;
  expiresInMinutes: number;
};

export type NewsletterConfirmPayload = {
  confirmUrl: string;
};

/** One entry per templateKey the queue can carry — see prisma/schema.prisma's NotificationJob comment for where each is enqueued. */
export type TemplatePayloadMap = {
  "reservation.confirmed": ReservationConfirmedPayload;
  "order.confirmed": OrderConfirmedPayload;
  "order.ready": OrderStatusPayload;
  "order.delivered": OrderStatusPayload;
  "order.cancelled": OrderCancelledPayload;
  "password.reset": PasswordResetPayload;
  "newsletter.confirm": NewsletterConfirmPayload;
};

export type TemplateKey = keyof TemplatePayloadMap;

export type RenderedEmail = { subject: string; html: string; text: string };

export type Template<Payload> = {
  render(payload: Payload, locale: Lang, business: TemplateBusiness): Promise<RenderedEmail>;
};
