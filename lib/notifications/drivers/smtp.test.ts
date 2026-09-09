import { describe, expect, it, vi, beforeEach } from "vitest";
import { MailerError } from "@/lib/notifications/mailer";

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

const config = {
  host: "mailhog",
  port: 1025,
  secure: false,
  fromEmail: "notifications@marea.test",
  fromName: "Marea",
};

const message = { to: "ana@example.com", subject: "hi", html: "<p>hi</p>", text: "hi" };

describe("createSmtpMailer", () => {
  beforeEach(() => {
    sendMail.mockReset();
  });

  it("sends and returns the provider message id", async () => {
    sendMail.mockResolvedValue({ messageId: "<abc@mailhog>" });
    const { createSmtpMailer } = await import("./smtp");
    const mailer = createSmtpMailer(config);

    const result = await mailer.send(message);

    expect(result).toEqual({ providerMessageId: "<abc@mailhog>" });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ana@example.com", from: "Marea <notifications@marea.test>" })
    );
  });

  it("classifies a 5xx SMTP response as a permanent failure", async () => {
    sendMail.mockRejectedValue(Object.assign(new Error("mailbox unavailable"), { responseCode: 550 }));
    const { createSmtpMailer } = await import("./smtp");
    const mailer = createSmtpMailer(config);

    await expect(mailer.send(message)).rejects.toMatchObject({ permanent: true });
  });

  it("classifies an invalid envelope as a permanent failure", async () => {
    sendMail.mockRejectedValue(Object.assign(new Error("no recipients"), { code: "EENVELOPE" }));
    const { createSmtpMailer } = await import("./smtp");
    const mailer = createSmtpMailer(config);

    await expect(mailer.send(message)).rejects.toMatchObject({ permanent: true });
  });

  it("classifies a 4xx SMTP response as transient", async () => {
    sendMail.mockRejectedValue(Object.assign(new Error("try again later"), { responseCode: 421 }));
    const { createSmtpMailer } = await import("./smtp");
    const mailer = createSmtpMailer(config);

    await expect(mailer.send(message)).rejects.toMatchObject({ permanent: false });
  });

  it("classifies a connection error as transient", async () => {
    sendMail.mockRejectedValue(Object.assign(new Error("connection refused"), { code: "ECONNECTION" }));
    const { createSmtpMailer } = await import("./smtp");
    const mailer = createSmtpMailer(config);

    await expect(mailer.send(message)).rejects.toBeInstanceOf(MailerError);
    await expect(mailer.send(message)).rejects.toMatchObject({ permanent: false });
  });
});
