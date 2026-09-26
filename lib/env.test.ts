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

describe("lib/env Stripe webhook secrets", () => {
  const keys = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_CONNECT_WEBHOOK_SECRET", "APP_ORIGIN", "NODE_ENV"] as const;
  const vars = process.env as Record<string, string | undefined>; // NODE_ENV is read-only in the typings
  const saved = Object.fromEntries(keys.map((k) => [k, vars[k]]));

  afterEach(() => {
    vi.resetModules();
    for (const k of keys) {
      if (saved[k] === undefined) delete vars[k];
      else vars[k] = saved[k];
    }
  });

  async function boot(set: Partial<Record<(typeof keys)[number], string>>) {
    vi.resetModules();
    for (const k of keys) delete vars[k];
    Object.assign(vars, { NODE_ENV: "production", APP_ORIGIN: "https://marea.example.com", ...set });
    const { env } = await import("@/lib/env");
    return () => env.STRIPE_SECRET_KEY;
  }

  it("refuses to boot in production with only one of the two endpoints' secrets, and names the missing one", async () => {
    const read = await boot({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_a" });
    expect(read).toThrow(/STRIPE_CONNECT_WEBHOOK_SECRET/);
  });

  it("names the platform secret when that is the missing one", async () => {
    const read = await boot({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_b" });
    expect(read).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });

  it("boots with both, and without Stripe at all", async () => {
    expect((await boot({ STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "a", STRIPE_CONNECT_WEBHOOK_SECRET: "b" }))()).toBe("sk_live_x");
    expect((await boot({}))()).toBeUndefined();
  });

  it("does not insist outside production", async () => {
    expect((await boot({ NODE_ENV: "development", STRIPE_SECRET_KEY: "sk_test_x" }))()).toBe("sk_test_x");
  });
});
