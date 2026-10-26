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

const GUARD_CALLS = [
  /requireRole(?:OrForbidden)?\(/,
  /requireOperationsRole(?:OrForbidden)?\(/,
  /requireRoleInAnyState\(/,
  /assertWritable\(/,
  /isPlatformReadOnly\(/,
  /guestWritesBlocked\(/,
];

// file path (relative to repo root, forward slashes) : function name.
// Every entry here is a deliberate decision, not an oversight:
const EXEMPT: Record<string, string[]> = {
  // Signing in, and the two flows that let someone finish signing in
  // (a forced password change, recovering a forgotten one) or sign out.
  "lib/auth/actions.ts": ["loginAction", "signOutAction", "changePasswordAction"],
  "lib/auth/reset-actions.ts": ["requestPasswordResetAction", "resetPasswordAction"],
  // Signing in as a demo persona: loginAction with the password filled in.
  "lib/demo/actions.ts": ["demoLoginAction"],
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

/**
 * Module 19, phase 8: the same walk, for the subscription's degrade ladder.
 * requireRole stops at READ_ONLY and guestWritesBlocked at SUSPENDED, so an
 * action using either is covered. The two ways around them are lists here,
 * each entry a decision with its reason:
 */

// Serving guests: keeps working in READ_ONLY, stops at SUSPENDED (requireOperationsRole).
const OPERATIONS: Record<string, string[]> = {
  "lib/orders/board-actions.ts": ["advanceOrderStatusAction", "cancelOrderAction", "collectCashPaymentAction"],
  "lib/payments/refund-actions.ts": ["createRefundAction"],
  "lib/cash-register/actions.ts": ["openCashSessionAction", "recordCashMovementAction", "closeCashSessionAction"],
  "lib/reservations/staff-actions.ts": [
    "confirmReservationAction",
    "reassignReservationTableAction",
    "seatReservationAction",
    "completeReservationAction",
    "markNoShowAction",
    "cancelReservationAction",
  ],
  "lib/printing/actions.ts": ["reprintKitchenTicketAction"],
  "lib/notifications/admin-actions.ts": ["retryNotificationJobAction"],
  // Sold out and stock, decided by the owner: a kitchen has to say "no more" mid-service.
  "lib/menu/item-actions.ts": ["toggleAvailabilityAction", "adjustMenuItemStockAction"],
};

// Works on every step (requireRoleInAnyState).
const ANY_STATE: Record<string, string[]> = {
  // Paying has to work always, or a restaurant behind on payment cannot get out.
  "lib/billing/actions.ts": ["startTrialAction", "addCardAction", "openPortalAction", "reactivateAction"],
  // Moves the session to another branch: the owner reaches the billing page from any of them.
  "lib/auth/switch-actions.ts": ["switchBusinessAction"],
  // Reads.
  "lib/orders/payment-actions.ts": ["getOrderPaymentDetailAction"],
  "lib/devices/actions.ts": ["getPrinterStatusAction"],
};

// Guarded against the platform's read-only only, never by the subscription.
const NO_SUBSCRIPTION_CHECK: Record<string, string[]> = {
  // No business exists yet, or it is not public yet.
  "lib/auth/signup-actions.ts": ["signupAction", "verifyEmailAction"],
  // Editing or emptying a cart already started; adding to it is blocked.
  "lib/cart/actions.ts": ["updateCartItemQuantityAction", "removeCartItemAction"],
  // A guest withdrawing a booking only lightens a suspended restaurant.
  "lib/reservations/actions.ts": ["cancelReservationByCodeAction"],
  // Paying for an order that already exists.
  "lib/payments/stripe-actions.ts": ["createPaymentIntentAction"],
};

const CONFIG_GUARDS = [/requireRole(?:OrForbidden)?\(/, /guestWritesBlocked\(/];

describe("every Server Action respects the subscription's degrade ladder", () => {
  const files = findActionFiles();

  for (const file of files) {
    const source = readFileSync(path.join(repoRoot(), file), "utf8");
    const exempt = new Set(EXEMPT[file] ?? []);
    const operations = new Set(OPERATIONS[file] ?? []);
    const anyState = new Set(ANY_STATE[file] ?? []);
    const unchecked = new Set(NO_SUBSCRIPTION_CHECK[file] ?? []);

    for (const { name, body } of exportedFunctions(source)) {
      if (exempt.has(name)) continue;
      it(`${file}: ${name}`, () => {
        const usesOperations = /requireOperationsRole(?:OrForbidden)?\(/.test(body);
        const usesAnyState = /requireRoleInAnyState\(/.test(body);
        const usesConfig = CONFIG_GUARDS.some((pattern) => pattern.test(body));

        expect(usesOperations, `${name}: requireOperationsRole must be listed in OPERATIONS, and every OPERATIONS entry must use it`).toBe(operations.has(name));
        expect(usesAnyState, `${name}: requireRoleInAnyState must be listed in ANY_STATE, and every ANY_STATE entry must use it`).toBe(anyState.has(name));
        if (unchecked.has(name)) {
          expect(usesConfig || usesOperations || usesAnyState, `${name} is in NO_SUBSCRIPTION_CHECK but now has a subscription guard — drop it from the list`).toBe(false);
        } else {
          expect(usesConfig || usesOperations || usesAnyState, `${name} skips the subscription's guard — use requireRole or guestWritesBlocked, or list it with a reason`).toBe(true);
        }
      });
    }
  }

  it("lists only actions that exist", () => {
    const names = new Set(files.flatMap((file) => exportedFunctions(readFileSync(path.join(repoRoot(), file), "utf8")).map(({ name }) => `${file}:${name}`)));
    for (const list of [OPERATIONS, ANY_STATE, NO_SUBSCRIPTION_CHECK]) {
      for (const [file, fns] of Object.entries(list)) for (const fn of fns) expect(names, `${file}:${fn}`).toContain(`${file}:${fn}`);
    }
  });
});
