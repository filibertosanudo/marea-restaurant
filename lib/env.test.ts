import { afterEach, describe, expect, it, vi } from "vitest";

describe("lib/env empty-string env var handling", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.APP_ORIGIN;
    delete process.env.DATABASE_POOL_MAX;
    delete process.env.STORAGE_DRIVER;
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
});
