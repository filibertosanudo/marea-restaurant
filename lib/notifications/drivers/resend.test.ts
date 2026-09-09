import { describe, expect, it, vi, beforeEach } from "vitest";
import { createResendMailer } from "./resend";

const config = { apiKey: "re_test_key", fromEmail: "notifications@marea.test", fromName: "Marea" };
const message = { to: "ana@example.com", subject: "hi", html: "<p>hi</p>", text: "hi" };

describe("createResendMailer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("sends and returns the provider message id", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "re_abc123" }), { status: 200 })
    );
    const mailer = createResendMailer(config);

    const result = await mailer.send(message);

    expect(result).toEqual({ providerMessageId: "re_abc123" });
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
  });

  it("sends the idempotency key as a header when given one", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ id: "re_1" }), { status: 200 }));
    const mailer = createResendMailer(config);

    await mailer.send({ ...message, idempotencyKey: "order:1:CONFIRMED" });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe("order:1:CONFIRMED");
  });

  it("classifies a 422 validation error as permanent", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("bad address", { status: 422 }));
    const mailer = createResendMailer(config);

    await expect(mailer.send(message)).rejects.toMatchObject({ permanent: true });
  });

  it("classifies a 429 rate limit as transient", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("slow down", { status: 429 }));
    const mailer = createResendMailer(config);

    await expect(mailer.send(message)).rejects.toMatchObject({ permanent: false });
  });

  it("classifies a 5xx provider error as transient", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("oops", { status: 502 }));
    const mailer = createResendMailer(config);

    await expect(mailer.send(message)).rejects.toMatchObject({ permanent: false });
  });
});
