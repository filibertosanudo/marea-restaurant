import "server-only";
import type { Lang } from "@/lib/i18n/lang";
import { reservationConfirmedTemplate } from "@/lib/notifications/templates/reservation-confirmed";
import { orderConfirmedTemplate } from "@/lib/notifications/templates/order-confirmed";
import { orderReadyTemplate, orderDeliveredTemplate } from "@/lib/notifications/templates/order-status";
import { orderCancelledTemplate } from "@/lib/notifications/templates/order-cancelled";
import { passwordResetTemplate } from "@/lib/notifications/templates/password-reset";
import { newsletterConfirmTemplate } from "@/lib/notifications/templates/newsletter-confirm";
import type { RenderedEmail, Template, TemplateBusiness, TemplateKey, TemplatePayloadMap } from "@/lib/notifications/templates/types";

const registry: { [K in TemplateKey]: Template<TemplatePayloadMap[K]> } = {
  "reservation.confirmed": reservationConfirmedTemplate,
  "order.confirmed": orderConfirmedTemplate,
  "order.ready": orderReadyTemplate,
  "order.delivered": orderDeliveredTemplate,
  "order.cancelled": orderCancelledTemplate,
  "password.reset": passwordResetTemplate,
  "newsletter.confirm": newsletterConfirmTemplate,
};

/** Thrown by renderTemplate for a templateKey with no matching template — never swallowed. A job that names one is a bug in whoever enqueued it, not something a retry fixes. */
export class UnknownTemplateError extends Error {
  constructor(templateKey: string) {
    super(`No template registered for templateKey "${templateKey}"`);
    this.name = "UnknownTemplateError";
  }
}

function resolveLang(locale: string): Lang {
  return locale === "en" ? "en" : "es";
}

/**
 * The one place templateKey (a plain string on NotificationJob, not an
 * enum — see the schema's own comment on why) turns into an actual
 * renderer. `payload` is whatever the job's own Json column holds, cast
 * to the shape the matched templateKey expects — the worker is trusted
 * to have enqueued it correctly, per this module's own "a template never
 * queries the database" rule; there's nowhere else left to validate it.
 */
export async function renderTemplate(
  templateKey: string,
  payload: unknown,
  locale: string,
  business: TemplateBusiness
): Promise<RenderedEmail> {
  const template = (registry as Record<string, Template<unknown> | undefined>)[templateKey];
  if (!template) {
    throw new UnknownTemplateError(templateKey);
  }
  return template.render(payload, resolveLang(locale), business);
}
