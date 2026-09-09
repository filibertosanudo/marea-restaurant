import { render } from "@react-email/render";
import { Button, Text } from "@react-email/components";
import type { Lang } from "@/lib/i18n/lang";
import { EmailLayout, emailStyles, textFooter } from "@/lib/notifications/templates/layout";
import type { OrderStatusPayload, Template, TemplateBusiness } from "@/lib/notifications/templates/types";

type StatusCopy = { subject: (orderNumber: string) => string; preview: string; heading: (orderNumber: string) => string; button: string };

/**
 * order.ready and order.delivered are the same shape — a folio and a link,
 * read standing up in three seconds per the module's own spec — so they
 * share this factory instead of two near-identical files. Each call site
 * still registers under its own exact templateKey; nothing here collapses
 * the two in the registry.
 */
function createOrderStatusTemplate(strings: Record<Lang, StatusCopy>): Template<OrderStatusPayload> {
  function html(payload: OrderStatusPayload, locale: Lang, business: TemplateBusiness) {
    const t = strings[locale];
    return (
      <EmailLayout previewText={t.preview} business={business}>
        <Text style={emailStyles.heading}>{t.heading(payload.orderNumber)}</Text>
        <Button href={payload.orderUrl} style={{ ...emailStyles.button, marginTop: "8px" }}>
          {t.button}
        </Button>
      </EmailLayout>
    );
  }

  function text(payload: OrderStatusPayload, locale: Lang, business: TemplateBusiness): string {
    const t = strings[locale];
    return `${t.heading(payload.orderNumber)}\n\n${t.button}: ${payload.orderUrl}` + textFooter(business);
  }

  return {
    async render(payload, locale, business) {
      return {
        subject: strings[locale].subject(payload.orderNumber),
        html: await render(html(payload, locale, business)),
        text: text(payload, locale, business),
      };
    },
  };
}

export const orderReadyTemplate = createOrderStatusTemplate({
  es: {
    subject: (orderNumber) => `Tu pedido ${orderNumber} está listo`,
    preview: "Tu pedido está listo",
    heading: (orderNumber) => `Tu pedido ${orderNumber} está listo`,
    button: "Ver mi pedido",
  },
  en: {
    subject: (orderNumber) => `Your order ${orderNumber} is ready`,
    preview: "Your order is ready",
    heading: (orderNumber) => `Your order ${orderNumber} is ready`,
    button: "View my order",
  },
});

export const orderDeliveredTemplate = createOrderStatusTemplate({
  es: {
    subject: (orderNumber) => `Pedido ${orderNumber} entregado`,
    preview: "Tu pedido fue entregado",
    heading: (orderNumber) => `Tu pedido ${orderNumber} fue entregado`,
    button: "Ver mi pedido",
  },
  en: {
    subject: (orderNumber) => `Order ${orderNumber} delivered`,
    preview: "Your order was delivered",
    heading: (orderNumber) => `Your order ${orderNumber} was delivered`,
    button: "View my order",
  },
});
