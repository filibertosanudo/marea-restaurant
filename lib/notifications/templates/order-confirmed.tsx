import { render } from "@react-email/render";
import { Button, Column, Row, Text } from "@react-email/components";
import type { Lang } from "@/lib/i18n/lang";
import { EmailLayout, emailStyles, textFooter } from "@/lib/notifications/templates/layout";
import type { OrderConfirmedPayload, OrderLineSummary, Template, TemplateBusiness } from "@/lib/notifications/templates/types";

const STRINGS = {
  es: {
    subject: (orderNumber: string) => `Pedido confirmado — ${orderNumber}`,
    preview: "Tu pedido fue recibido",
    heading: "Tu pedido fue recibido",
    order: (orderNumber: string) => `Folio ${orderNumber}`,
    total: "Total",
    button: "Ver mi pedido",
  },
  en: {
    subject: (orderNumber: string) => `Order confirmed — ${orderNumber}`,
    preview: "Your order was received",
    heading: "Your order was received",
    order: (orderNumber: string) => `Order ${orderNumber}`,
    total: "Total",
    button: "View my order",
  },
} satisfies Record<Lang, unknown>;

function lineText(line: OrderLineSummary): string {
  return `${line.quantity} × ${line.name} — ${line.lineTotal}`;
}

function html(payload: OrderConfirmedPayload, locale: Lang, business: TemplateBusiness) {
  const t = STRINGS[locale];
  return (
    <EmailLayout previewText={t.preview} business={business}>
      <Text style={emailStyles.heading}>{t.heading}</Text>
      <Text style={{ ...emailStyles.paragraph, fontWeight: 600 }}>{t.order(payload.orderNumber)}</Text>
      {payload.items.map((line, i) => (
        <Row key={i} style={{ marginBottom: "4px" }}>
          <Column>
            <Text style={{ ...emailStyles.paragraph, margin: 0 }}>
              {line.quantity} × {line.name}
            </Text>
          </Column>
          <Column align="right">
            <Text style={{ ...emailStyles.paragraph, margin: 0 }}>{line.lineTotal}</Text>
          </Column>
        </Row>
      ))}
      <Row style={{ marginTop: "12px" }}>
        <Column>
          <Text style={{ ...emailStyles.paragraph, margin: 0, fontWeight: 600 }}>{t.total}</Text>
        </Column>
        <Column align="right">
          <Text style={{ ...emailStyles.paragraph, margin: 0, fontWeight: 600 }}>{payload.total}</Text>
        </Column>
      </Row>
      <Button href={payload.orderUrl} style={{ ...emailStyles.button, marginTop: "20px" }}>
        {t.button}
      </Button>
    </EmailLayout>
  );
}

function text(payload: OrderConfirmedPayload, locale: Lang, business: TemplateBusiness): string {
  const t = STRINGS[locale];
  const lines = payload.items.map(lineText).join("\n");
  return (
    `${t.heading}\n\n` +
    `${t.order(payload.orderNumber)}\n\n` +
    `${lines}\n\n` +
    `${t.total}: ${payload.total}\n\n` +
    `${t.button}: ${payload.orderUrl}` +
    textFooter(business)
  );
}

export const orderConfirmedTemplate: Template<OrderConfirmedPayload> = {
  async render(payload, locale, business) {
    return {
      subject: STRINGS[locale].subject(payload.orderNumber),
      html: await render(html(payload, locale, business)),
      text: text(payload, locale, business),
    };
  },
};
