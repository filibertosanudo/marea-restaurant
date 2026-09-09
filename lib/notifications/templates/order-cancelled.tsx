import { render } from "@react-email/render";
import { Button, Text } from "@react-email/components";
import type { Lang } from "@/lib/i18n/lang";
import { EmailLayout, emailStyles, textFooter } from "@/lib/notifications/templates/layout";
import type { OrderCancelledPayload, Template, TemplateBusiness } from "@/lib/notifications/templates/types";

const STRINGS = {
  es: {
    subject: (orderNumber: string) => `Pedido ${orderNumber} cancelado`,
    preview: "Tu pedido fue cancelado",
    heading: (orderNumber: string) => `Tu pedido ${orderNumber} fue cancelado`,
    reasonLabel: "Motivo",
    button: "Ver mi pedido",
  },
  en: {
    subject: (orderNumber: string) => `Order ${orderNumber} cancelled`,
    preview: "Your order was cancelled",
    heading: (orderNumber: string) => `Your order ${orderNumber} was cancelled`,
    reasonLabel: "Reason",
    button: "View my order",
  },
} satisfies Record<Lang, unknown>;

function html(payload: OrderCancelledPayload, locale: Lang, business: TemplateBusiness) {
  const t = STRINGS[locale];
  return (
    <EmailLayout previewText={t.preview} business={business}>
      <Text style={emailStyles.heading}>{t.heading(payload.orderNumber)}</Text>
      <Text style={{ ...emailStyles.paragraph, marginBottom: "4px" }}>{t.reasonLabel}</Text>
      <Text style={emailStyles.paragraph}>{payload.reason}</Text>
      <Button href={payload.orderUrl} style={{ ...emailStyles.button, marginTop: "8px" }}>
        {t.button}
      </Button>
    </EmailLayout>
  );
}

function text(payload: OrderCancelledPayload, locale: Lang, business: TemplateBusiness): string {
  const t = STRINGS[locale];
  return (
    `${t.heading(payload.orderNumber)}\n\n` +
    `${t.reasonLabel}: ${payload.reason}\n\n` +
    `${t.button}: ${payload.orderUrl}` +
    textFooter(business)
  );
}

export const orderCancelledTemplate: Template<OrderCancelledPayload> = {
  async render(payload, locale, business) {
    return {
      subject: STRINGS[locale].subject(payload.orderNumber),
      html: await render(html(payload, locale, business)),
      text: text(payload, locale, business),
    };
  },
};
