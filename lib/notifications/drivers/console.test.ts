import { describe, expect, it, vi } from "vitest";
import { createConsoleMailer } from "./console";

describe("createConsoleMailer", () => {
  it("logs the message and sends nothing", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mailer = createConsoleMailer();

    const result = await mailer.send({
      to: "ana@example.com",
      subject: "Your reservation is confirmed",
      html: "<p>hi</p>",
      text: "hi",
    });

    expect(result).toEqual({ providerMessageId: null });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("ana@example.com"));
    logSpy.mockRestore();
  });

  it("includes the idempotency key in the log line when given one", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const mailer = createConsoleMailer();

    await mailer.send({
      to: "ana@example.com",
      subject: "Your order is ready",
      html: "<p>hi</p>",
      text: "hi",
      idempotencyKey: "order:123:READY",
    });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("order:123:READY"));
    logSpy.mockRestore();
  });
});
