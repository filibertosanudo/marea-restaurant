import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  CLOCK_SKEW_ALLOWANCE_MS,
  HEARTBEAT_INTERVAL_MS,
  PRISMA_TRANSACTION_TIMEOUT_MS,
  RECOVERY_WINDOW_MS,
} from "./timing";

const ROOT = resolve(import.meta.dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === "generated" || name === ".next") return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("recovery window", () => {
  it("covers the longest a transaction can stay open, with margin and the clock skew allowance", () => {
    expect(RECOVERY_WINDOW_MS).toBeGreaterThanOrEqual(2 * PRISMA_TRANSACTION_TIMEOUT_MS + CLOCK_SKEW_ALLOWANCE_MS);
  });

  it("is not tuned by the heartbeat: they are separate settings that may drift apart", () => {
    // Equal by coincidence today would be a reason to merge them; if they ever
    // are equal, this is the reminder that they mean different things.
    expect(RECOVERY_WINDOW_MS).not.toBe(HEARTBEAT_INTERVAL_MS);
  });

  it("stays valid only while nothing raises the transaction timeout above Prisma's default", () => {
    // The window is derived from that default. A `timeout:` option on a
    // $transaction, or transactionOptions on the client, lets a row become
    // visible later than the window covers, and a recovery sweep could then
    // miss it. Raising one means revisiting RECOVERY_WINDOW_MS first.
    const offenders: string[] = [];
    for (const dir of ["lib", "app", "scripts"]) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const text = readFileSync(file, "utf8");
        if (/transactionOptions/.test(text)) offenders.push(`${file}: transactionOptions`);
        for (const match of text.matchAll(/\$transaction\([\s\S]*?\{\s*(?:maxWait:\s*[\d_]+,\s*)?timeout:\s*([\d_]+)/g)) {
          offenders.push(`${file}: timeout ${match[1]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
