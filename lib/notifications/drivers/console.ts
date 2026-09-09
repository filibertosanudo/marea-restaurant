import "server-only";
import type { Mailer } from "@/lib/notifications/mailer";

/**
 * Prints and sends nothing — the driver behind every test and every local
 * `npm run dev` without mail credentials. Never throws, so it can't be the
 * reason a job fails; that's the point of having it at all.
 */
export function createConsoleMailer(): Mailer {
  return {
    async send(message) {
      console.log(
        `[mailer:console] to=${message.to} subject=${JSON.stringify(message.subject)}` +
          (message.idempotencyKey ? ` idempotencyKey=${message.idempotencyKey}` : "")
      );
      return { providerMessageId: null };
    },
  };
}
