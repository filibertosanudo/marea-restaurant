import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import path from "node:path";

const SEED_SCRIPT = path.resolve(import.meta.dirname, "seed.ts");

function runSeed(env: Record<string, string>) {
  return spawnSync("npx", ["tsx", SEED_SCRIPT], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout: 15_000,
    shell: true, // npx has no .exe on Windows; spawnSync needs a shell to resolve it
  });
}

// Runs the real script as a subprocess: assertLocalTarget() runs (and can
// process.exit) at import time, before anything in the module is
// reachable to call directly, so there's no in-process way to test it.
describe("prisma/seed.ts local-target guard", () => {
  it("refuses a host=<remote> query override disguised behind a local authority", () => {
    // pg-connection-string treats "host" as an override that wins over the
    // URL's own authority — a plain URL().hostname read (what the guard
    // used to rely on alone) can't see that, so this string would
    // previously pass the guard while actually connecting elsewhere.
    const result = runSeed({
      DIRECT_URL: "postgresql://localhost/db?host=evil.internal",
      DATABASE_URL: "",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to seed");
    // runSeed's own spawnSync timeout is 15s — a cold npx/tsx start can run
    // close to vitest's 5s default, so the test's budget has to be at
    // least as generous as the subprocess's own, or this flakes on exactly
    // the slow-start case it's supposed to tolerate, not on a real bug.
  }, 15_000);

  it("still allows a genuine local target", () => {
    const result = runSeed({
      DIRECT_URL: "postgresql://user:pass@localhost:5432/db",
      DATABASE_URL: "",
      // Stop short of actually connecting/seeding — a real DB isn't
      // guaranteed to be listening on 5432 in every environment this runs
      // in. The guard passing is what this test asserts; a connection
      // failure past that point is a separate, expected outcome here.
    });
    expect(result.stderr).not.toContain("Refusing to seed");
  }, 15_000);
});
