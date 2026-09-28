import { render } from "@react-email/render";
import { Button, Text } from "@react-email/components";
import type { Lang } from "@/lib/i18n/lang";
import { EmailLayout, emailStyles, textFooter } from "@/lib/notifications/templates/layout";
import type { SignupVerifyPayload, Template, TemplateBusiness } from "@/lib/notifications/templates/types";

const STRINGS = {
  es: {
    subject: "Confirma tu correo",
    preview: "Confirma tu correo para activar tu cuenta",
    heading: (name: string) => `Bienvenido, ${name}`,
    intro: (hours: number) => `Confirma tu correo para publicar tu página y conectar Stripe. Este enlace es válido por ${hours} horas.`,
    button: "Confirmar mi correo",
    ignore: "Si tú no creaste esta cuenta, puedes ignorar este correo.",
  },
  en: {
    subject: "Confirm your email",
    preview: "Confirm your email to activate your account",
    heading: (name: string) => `Welcome, ${name}`,
    intro: (hours: number) => `Confirm your email to publish your page and connect Stripe. This link is valid for ${hours} hours.`,
    button: "Confirm my email",
    ignore: "If you didn't create this account, you can ignore this email.",
  },
} satisfies Record<Lang, unknown>;

function html(payload: SignupVerifyPayload, locale: Lang, business: TemplateBusiness) {
  const t = STRINGS[locale];
  return (
    <EmailLayout previewText={t.preview} business={business}>
      <Text style={emailStyles.heading}>{t.heading(payload.businessName)}</Text>
      <Text style={emailStyles.paragraph}>{t.intro(payload.expiresInHours)}</Text>
      <Button href={payload.verifyUrl} style={emailStyles.button}>
        {t.button}
      </Button>
      <Text style={emailStyles.small}>{t.ignore}</Text>
    </EmailLayout>
  );
}

function text(payload: SignupVerifyPayload, locale: Lang, business: TemplateBusiness): string {
  const t = STRINGS[locale];
  return (
    `${t.heading(payload.businessName)}\n\n` +
    `${t.intro(payload.expiresInHours)}\n\n` +
    `${t.button}: ${payload.verifyUrl}\n\n` +
    `${t.ignore}` +
    textFooter(business)
  );
}

export const signupVerifyTemplate: Template<SignupVerifyPayload> = {
  async render(payload, locale, business) {
    return {
      subject: STRINGS[locale].subject,
      html: await render(html(payload, locale, business)),
      text: text(payload, locale, business),
    };
  },
};
