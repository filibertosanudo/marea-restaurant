import "server-only";

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /**
   * Passed straight through to the provider's own idempotency key when it
   * has one (Resend does; SMTP has no such concept). The one closing move
   * against double-sends that the retry queue itself can't guarantee — see
   * lib/notifications/queue.ts's own header comment.
   */
  idempotencyKey?: string;
};

export interface Mailer {
  send(message: MailMessage): Promise<{ providerMessageId: string | null }>;
}

/**
 * Thrown by a driver's send() on failure. `permanent` is what lets the
 * worker tell "this address doesn't exist" (fail once, no retry) apart
 * from "the SMTP server hiccupped" (back off and try again) without
 * re-parsing each provider's own error shape at the call site — every
 * driver classifies its own failures here, once.
 */
export class MailerError extends Error {
  permanent: boolean;
  constructor(message: string, permanent: boolean) {
    super(message);
    this.name = "MailerError";
    this.permanent = permanent;
  }
}
