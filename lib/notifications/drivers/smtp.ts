import "server-only";
import nodemailer from "nodemailer";
import { MailerError, type Mailer } from "@/lib/notifications/mailer";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  fromEmail: string;
  fromName: string;
};

/**
 * A permanent SMTP rejection (bad mailbox, bad domain, relay refused) comes
 * back as a 5xx response code, or as nodemailer's own EENVELOPE for an
 * address it wouldn't even attempt. Everything else — timeouts, connection
 * resets, a 4xx "try again later" — is transient and belongs in the
 * queue's backoff, not a same-attempt failure.
 */
function isPermanentSmtpFailure(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = "code" in err ? String((err as { code?: unknown }).code) : undefined;
  if (code === "EENVELOPE") return true;
  const responseCode = "responseCode" in err ? Number((err as { responseCode?: unknown }).responseCode) : undefined;
  return typeof responseCode === "number" && responseCode >= 500 && responseCode < 600;
}

/** Talks SMTP — Postfix, Zoho, Brevo, Mailgun, SES, or a local MailHog. Protocol, not a product: no provider-specific code lives here. */
export function createSmtpMailer(config: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.password ? { user: config.user, pass: config.password } : undefined,
  });

  return {
    async send(message) {
      try {
        const info = await transport.sendMail({
          from: `${config.fromName} <${config.fromEmail}>`,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
        return { providerMessageId: info.messageId ?? null };
      } catch (err) {
        throw new MailerError(err instanceof Error ? err.message : "SMTP send failed", isPermanentSmtpFailure(err));
      }
    },
  };
}
