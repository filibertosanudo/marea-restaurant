import { render } from "@react-email/render";
import { Button, Text } from "@react-email/components";
import type { Lang } from "@/lib/i18n/lang";
import { EmailLayout, emailStyles, textFooter } from "@/lib/notifications/templates/layout";
import type { SignupEmailTakenPayload, Template, TemplateBusiness } from "@/lib/notifications/templates/types";

// Sent instead of a verification link when someone signs up with an email
// that already has an account — same "check your email" response either
// way, so this is the only place that difference is visible, and only to
// the address's real owner. No mention of what business name or slug the
// signup attempt used: that's exactly the enumeration this is here to avoid.
const STRINGS = {
  es: {
    subject: "Alguien intentó registrarse con tu correo",
    preview: "Alguien intentó registrarse con tu correo",
    heading: "Ya tienes una cuenta",
    intro: "Alguien intentó crear una cuenta nueva con este correo, que ya tiene una. Si fuiste tú, inicia sesión normalmente.",
    loginButton: "Iniciar sesión",
    forgot: "¿Olvidaste tu contraseña?",
    ignore: "Si no fuiste tú, puedes ignorar este correo — no se creó ninguna cuenta nueva.",
  },
  en: {
    subject: "Someone tried to sign up with your email",
    preview: "Someone tried to sign up with your email",
    heading: "You already have an account",
    intro: "Someone tried to create a new account with this email, which already has one. If that was you, sign in as usual.",
    loginButton: "Sign in",
    forgot: "Forgot your password?",
    ignore: "If it wasn't you, you can ignore this email — no new account was created.",
  },
} satisfies Record<Lang, unknown>;

function html(payload: SignupEmailTakenPayload, locale: Lang, business: TemplateBusiness) {
  const t = STRINGS[locale];
  return (
    <EmailLayout previewText={t.preview} business={business}>
      <Text style={emailStyles.heading}>{t.heading}</Text>
      <Text style={emailStyles.paragraph}>{t.intro}</Text>
      <Button href={payload.loginUrl} style={emailStyles.button}>
        {t.loginButton}
      </Button>
      <Text style={emailStyles.small}>
        <a href={payload.forgotPasswordUrl}>{t.forgot}</a>
      </Text>
      <Text style={emailStyles.small}>{t.ignore}</Text>
    </EmailLayout>
  );
}

function text(payload: SignupEmailTakenPayload, locale: Lang, business: TemplateBusiness): string {
  const t = STRINGS[locale];
  return (
    `${t.heading}\n\n` +
    `${t.intro}\n\n` +
    `${t.loginButton}: ${payload.loginUrl}\n` +
    `${t.forgot}: ${payload.forgotPasswordUrl}\n\n` +
    `${t.ignore}` +
    textFooter(business)
  );
}

export const signupEmailTakenTemplate: Template<SignupEmailTakenPayload> = {
  async render(payload, locale, business) {
    return {
      subject: STRINGS[locale].subject,
      html: await render(html(payload, locale, business)),
      text: text(payload, locale, business),
    };
  },
};
