import "server-only";
import { MailerError, type Mailer } from "@/lib/notifications/mailer";

export type ResendConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
};

const RESEND_API_URL = "https://api.resend.com/emails";

/**
 * Talks to Resend's HTTP API directly with `fetch` instead of pulling in
 * their SDK — it's a single JSON POST, and this keeps the same "protocol,
 * not a product" footprint the SMTP driver has. Optional: only wired up
 * when MAIL_DRIVER=resend, per lib/notifications/index.ts.
 */
export function createResendMailer(config: ResendConfig): Mailer {
  return {
    async send(message) {
      const response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
          ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: `${config.fromName} <${config.fromEmail}>`,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        // 4xx other than a rate limit means the request itself is bad
        // (invalid address, unverified domain) and won't succeed on retry;
        // 429 and 5xx are the provider asking to be tried again later.
        const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
        throw new MailerError(`Resend responded ${response.status}: ${body}`, permanent);
      }

      const data = (await response.json()) as { id?: string };
      return { providerMessageId: data.id ?? null };
    },
  };
}
