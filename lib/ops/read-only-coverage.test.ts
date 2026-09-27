import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guarantee for module 18 phase 6: every Server Action reaches
 * the read-only guard, one way or another, before it does anything else.
 * Walks every "use server" file rather than trusting a hand-written list of
 * action names — that list goes stale the moment someone adds an action and
 * forgets it, which is exactly the failure this test exists to catch.
 *
 * A function is covered if its own source (from its `export async function`
 * line to the next one, or EOF) calls one of the two paths that check:
 *   - requireRole(...) / requireRoleOrForbidden(...) — requireRole itself
 *     calls assertWritable() first (lib/auth/permissions.ts), so anything
 *     reaching it is covered without repeating the check.
 *   - assertWritable(...) / isPlatformReadOnly(...) — called directly by
 *     the handful of guest-facing actions that have no role to require.
 *
 * A function not in EXEMPT and matching none of those is a real gap: either
 * it needs the guard, or it belongs in EXEMPT with a reason.
 */

const GUARD_CALLS = [/requireRole(?:OrForbidden)?\(/, /assertWritable\(/, /isPlatformReadOnly\(/];

// file path (relative to repo root, forward slashes) : function name.
// Every entry here is a deliberate decision, not an oversight:
const EXEMPT: Record<string, string[]> = {
  // Signing in, and the two flows that let someone finish signing in
  // (a forced password change, recovering a forgotten one) or sign out.
  "lib/auth/actions.ts": ["loginAction", "signOutAction", "changePasswordAction"],
  "lib/auth/reset-actions.ts": ["requestPasswordResetAction", "resetPasswordAction"],
  // A cookie only, no database write.
  "lib/cart/actions.ts": ["setTableCookieAction"],
  "lib/i18n/actions.ts": ["setAdminLangAction", "setOrderLangAction"],
  // Confirming or unsubscribing needs a token already emailed before the
  // window opened, same class as the password reset flow above.
  "lib/newsletter/actions.ts": ["confirmSubscriptionAction", "unsubscribeAction"],
  // A read, not a mutation.
  "lib/reservations/actions.ts": ["getReservationSlotsAction"],
};

function repoRoot(): string {
  return path.resolve(import.meta.dirname, "..", "..");
}

function findActionFiles(): string[] {
  const root = repoRoot();
  return globSync("{lib,app}/**/*.ts", { cwd: root })
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => !file.includes(".test.ts") && !file.includes("node_modules"))
    .filter((file) => readFileSync(path.join(root, file), "utf8").includes('"use server"'))
    .sort();
}

function exportedFunctions(source: string): { name: string; body: string }[] {
  const marker = /^export async function (\w+)/gm;
  const starts: { name: string; index: number }[] = [];
  for (const match of source.matchAll(marker)) {
    starts.push({ name: match[1], index: match.index });
  }
  return starts.map((start, i) => ({
    name: start.name,
    body: source.slice(start.index, starts[i + 1]?.index ?? source.length),
  }));
}

describe("every Server Action reaches the read-only guard", () => {
  const files = findActionFiles();

  it("found the action files this test is supposed to cover", () => {
    // A canary against the glob itself silently matching nothing (a moved
    // directory, a renamed extension) and this whole test passing for the
    // wrong reason.
    expect(files.length).toBeGreaterThanOrEqual(26);
  });

  for (const file of files) {
    const source = readFileSync(path.join(repoRoot(), file), "utf8");
    const functions = exportedFunctions(source);
    const exempt = new Set(EXEMPT[file] ?? []);

    for (const { name, body } of functions) {
      it(`${file}: ${name}`, () => {
        const guarded = GUARD_CALLS.some((pattern) => pattern.test(body));
        if (exempt.has(name)) {
          expect(guarded, `${name} is listed in EXEMPT but now also calls the guard — drop it from EXEMPT`).toBe(false);
        } else {
          expect(guarded, `${name} calls neither requireRole nor assertWritable/isPlatformReadOnly — add the guard, or add it to EXEMPT with a reason`).toBe(true);
        }
      });
    }
  }
});
