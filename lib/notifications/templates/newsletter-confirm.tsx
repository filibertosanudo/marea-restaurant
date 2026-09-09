import { render } from "@react-email/render";
import { Button, Text } from "@react-email/components";
import type { Lang } from "@/lib/i18n/lang";
import { EmailLayout, emailStyles, textFooter } from "@/lib/notifications/templates/layout";
import type { NewsletterConfirmPayload, Template, TemplateBusiness } from "@/lib/notifications/templates/types";

const STRINGS = {
  es: {
    subject: "Confirma tu suscripción",
    preview: "Confirma tu suscripción",
    heading: "Confirma tu suscripción",
    intro: "Un paso más: confirma que quieres recibir noticias de nosotros.",
    button: "Confirmar suscripción",
    ignore: "Si tú no pediste esto, puedes ignorar este correo — no se te suscribirá.",
  },
  en: {
    subject: "Confirm your subscription",
    preview: "Confirm your subscription",
    heading: "Confirm your subscription",
    intro: "One more step: confirm you'd like to hear from us.",
    button: "Confirm subscription",
    ignore: "If you didn't request this, you can ignore this email — you won't be subscribed.",
  },
} satisfies Record<Lang, unknown>;

function html(payload: NewsletterConfirmPayload, locale: Lang, business: TemplateBusiness) {
  const t = STRINGS[locale];
  return (
    <EmailLayout previewText={t.preview} business={business}>
      <Text style={emailStyles.heading}>{t.heading}</Text>
      <Text style={emailStyles.paragraph}>{t.intro}</Text>
      <Button href={payload.confirmUrl} style={emailStyles.button}>
        {t.button}
      </Button>
      <Text style={emailStyles.small}>{t.ignore}</Text>
    </EmailLayout>
  );
}

function text(payload: NewsletterConfirmPayload, locale: Lang, business: TemplateBusiness): string {
  const t = STRINGS[locale];
  return `${t.heading}\n\n${t.intro}\n\n${t.button}: ${payload.confirmUrl}\n\n${t.ignore}` + textFooter(business);
}

export const newsletterConfirmTemplate: Template<NewsletterConfirmPayload> = {
  async render(payload, locale, business) {
    return {
      subject: STRINGS[locale].subject,
      html: await render(html(payload, locale, business)),
      text: text(payload, locale, business),
    };
  },
};
