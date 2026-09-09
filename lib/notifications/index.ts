import "server-only";
import { env } from "@/lib/env";
import type { Mailer } from "@/lib/notifications/mailer";
import { createConsoleMailer } from "@/lib/notifications/drivers/console";
import { createSmtpMailer } from "@/lib/notifications/drivers/smtp";
import { createResendMailer } from "@/lib/notifications/drivers/resend";

function resolveMailer(): Mailer {
  if (env.MAIL_DRIVER === "smtp") {
    // env.ts's superRefine already requires SMTP_HOST/MAIL_FROM_EMAIL
    // whenever MAIL_DRIVER=smtp — an incomplete config fails at boot,
    // never here mid-send.
    return createSmtpMailer({
      host: env.SMTP_HOST!,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      fromEmail: env.MAIL_FROM_EMAIL!,
      fromName: env.MAIL_FROM_NAME,
    });
  }
  if (env.MAIL_DRIVER === "resend") {
    return createResendMailer({
      apiKey: env.RESEND_API_KEY!,
      fromEmail: env.MAIL_FROM_EMAIL!,
      fromName: env.MAIL_FROM_NAME,
    });
  }
  return createConsoleMailer();
}

// Same globalThis-cache reasoning as lib/storage/index.ts and lib/prisma.ts:
// `next dev`'s Fast Refresh re-evaluates this module on every save, and a
// plain module variable would open a fresh SMTP connection pool each time.
const globalForMailer = globalThis as unknown as { mailer?: Mailer };

/** Resolved once per process, lazily — first real use, not at import. */
export function getMailer(): Mailer {
  if (!globalForMailer.mailer) {
    globalForMailer.mailer = resolveMailer();
  }
  return globalForMailer.mailer;
}
