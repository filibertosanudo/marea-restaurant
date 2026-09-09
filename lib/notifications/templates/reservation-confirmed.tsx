import { render } from "@react-email/render";
import { Button, Text } from "@react-email/components";
import type { Lang } from "@/lib/i18n/lang";
import { EmailLayout, emailStyles, textFooter } from "@/lib/notifications/templates/layout";
import type { ReservationConfirmedPayload, Template, TemplateBusiness } from "@/lib/notifications/templates/types";

const STRINGS = {
  es: {
    subject: (code: string) => `Reservación confirmada — código ${code}`,
    preview: "Tu mesa está confirmada",
    heading: "Tu mesa está confirmada",
    intro: (partySize: number) => `Reservación para ${partySize} ${partySize === 1 ? "persona" : "personas"}, el:`,
    codeLabel: "Tu código de confirmación",
    codeNote: "Guárdalo: es lo único que necesitas para consultar o cancelar tu reservación.",
    button: "Ver mi reservación",
  },
  en: {
    subject: (code: string) => `Reservation confirmed — code ${code}`,
    preview: "Your table is confirmed",
    heading: "Your table is confirmed",
    intro: (partySize: number) => `Reservation for ${partySize} ${partySize === 1 ? "guest" : "guests"}, on:`,
    codeLabel: "Your confirmation code",
    codeNote: "Keep it — it's the only thing you need to look up or cancel your reservation.",
    button: "View my reservation",
  },
} satisfies Record<Lang, unknown>;

function html(payload: ReservationConfirmedPayload, locale: Lang, business: TemplateBusiness) {
  const t = STRINGS[locale];
  return (
    <EmailLayout previewText={t.preview} business={business}>
      <Text style={emailStyles.heading}>{t.heading}</Text>
      <Text style={emailStyles.paragraph}>{t.intro(payload.partySize)}</Text>
      <Text style={{ ...emailStyles.paragraph, fontWeight: 600 }}>{payload.reservedForLabel}</Text>
      <Text style={{ ...emailStyles.paragraph, marginBottom: "4px" }}>{t.codeLabel}</Text>
      <Text style={emailStyles.code}>{payload.confirmationCode}</Text>
      <Text style={emailStyles.small}>{t.codeNote}</Text>
      <Button href={payload.reservationUrl} style={{ ...emailStyles.button, marginTop: "8px" }}>
        {t.button}
      </Button>
    </EmailLayout>
  );
}

function text(payload: ReservationConfirmedPayload, locale: Lang, business: TemplateBusiness): string {
  const t = STRINGS[locale];
  return (
    `${t.heading}\n\n` +
    `${t.intro(payload.partySize)} ${payload.reservedForLabel}\n\n` +
    `${t.codeLabel}: ${payload.confirmationCode}\n` +
    `${t.codeNote}\n\n` +
    `${t.button}: ${payload.reservationUrl}` +
    textFooter(business)
  );
}

export const reservationConfirmedTemplate: Template<ReservationConfirmedPayload> = {
  async render(payload, locale, business) {
    return {
      subject: STRINGS[locale].subject(payload.confirmationCode),
      html: await render(html(payload, locale, business)),
      text: text(payload, locale, business),
    };
  },
};
