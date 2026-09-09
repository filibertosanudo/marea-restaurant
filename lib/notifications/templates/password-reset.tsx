import { render } from "@react-email/render";
import { Button, Text } from "@react-email/components";
import type { Lang } from "@/lib/i18n/lang";
import { EmailLayout, emailStyles, textFooter } from "@/lib/notifications/templates/layout";
import type { PasswordResetPayload, Template, TemplateBusiness } from "@/lib/notifications/templates/types";

const STRINGS = {
  es: {
    subject: "Restablece tu contraseña",
    preview: "Restablece tu contraseña",
    heading: "Restablece tu contraseña",
    intro: (minutes: number) => `Este enlace es válido por ${minutes} minutos.`,
    button: "Restablecer contraseña",
    ignore: "Si tú no pediste esto, puedes ignorar este correo — tu contraseña no cambiará.",
  },
  en: {
    subject: "Reset your password",
    preview: "Reset your password",
    heading: "Reset your password",
    intro: (minutes: number) => `This link is valid for ${minutes} minutes.`,
    button: "Reset password",
    ignore: "If you didn't request this, you can ignore this email — your password won't change.",
  },
} satisfies Record<Lang, unknown>;

function html(payload: PasswordResetPayload, locale: Lang, business: TemplateBusiness) {
  const t = STRINGS[locale];
  return (
    <EmailLayout previewText={t.preview} business={business}>
      <Text style={emailStyles.heading}>{t.heading}</Text>
      <Text style={emailStyles.paragraph}>{t.intro(payload.expiresInMinutes)}</Text>
      <Button href={payload.resetUrl} style={emailStyles.button}>
        {t.button}
      </Button>
      <Text style={emailStyles.small}>{t.ignore}</Text>
    </EmailLayout>
  );
}

function text(payload: PasswordResetPayload, locale: Lang, business: TemplateBusiness): string {
  const t = STRINGS[locale];
  return (
    `${t.heading}\n\n` +
    `${t.intro(payload.expiresInMinutes)}\n\n` +
    `${t.button}: ${payload.resetUrl}\n\n` +
    `${t.ignore}` +
    textFooter(business)
  );
}

export const passwordResetTemplate: Template<PasswordResetPayload> = {
  async render(payload, locale, business) {
    return {
      subject: STRINGS[locale].subject,
      html: await render(html(payload, locale, business)),
      text: text(payload, locale, business),
    };
  },
};
