import { afterEach, describe, expect, it, vi } from "vitest";

describe("lib/env empty-string env var handling", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.APP_ORIGIN;
    delete process.env.DATABASE_POOL_MAX;
    delete process.env.STORAGE_DRIVER;
    delete process.env.MAIL_DRIVER;
    delete process.env.SMTP_HOST;
    delete process.env.MAIL_FROM_EMAIL;
    delete process.env.RESEND_API_KEY;
  });

  it("treats an empty string the same as an absent optional var", async () => {
    // Docker Compose's ${VAR:-} (and more than one PaaS dashboard) sets an
    // unset optional var to "" rather than omitting it — this regressed
    // APP_ORIGIN specifically when docker-compose.yml first shipped.
    process.env.APP_ORIGIN = "";
    process.env.AUTH_URL = "http://localhost:3000";
    const { env, appOrigin } = await import("@/lib/env");
    expect(env.APP_ORIGIN).toBeUndefined();
    expect(appOrigin()).toBe("http://localhost:3000");
  });

  it("falls back to the default, not a validation error, when a defaulted var is an empty string", async () => {
    // z's .default() only substitutes for a genuinely undefined input, not
    // an empty string — the same Compose/PaaS idiom above breaks any
    // defaulted field exactly the same way an optional one does.
    process.env.DATABASE_POOL_MAX = "";
    process.env.STORAGE_DRIVER = "";
    const { env } = await import("@/lib/env");
    expect(env.DATABASE_POOL_MAX).toBe(25);
    expect(env.STORAGE_DRIVER).toBe("local");
  });

  it("defaults MAIL_DRIVER to console, which needs no credentials", async () => {
    const { env } = await import("@/lib/env");
    expect(env.MAIL_DRIVER).toBe("console");
  });

  it("fails at import when MAIL_DRIVER=smtp is missing its host and from address", async () => {
    process.env.MAIL_DRIVER = "smtp";
    await expect(import("@/lib/env").then((m) => m.env.MAIL_DRIVER)).rejects.toThrow(/SMTP_HOST/);
  });

  it("fails at import when MAIL_DRIVER=resend is missing its api key", async () => {
    process.env.MAIL_DRIVER = "resend";
    process.env.MAIL_FROM_EMAIL = "notifications@marea.test";
    await expect(import("@/lib/env").then((m) => m.env.MAIL_DRIVER)).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("accepts MAIL_DRIVER=smtp once its required fields are set", async () => {
    process.env.MAIL_DRIVER = "smtp";
    process.env.SMTP_HOST = "mailhog";
    process.env.MAIL_FROM_EMAIL = "notifications@marea.test";
    const { env } = await import("@/lib/env");
    expect(env.MAIL_DRIVER).toBe("smtp");
  });
});
