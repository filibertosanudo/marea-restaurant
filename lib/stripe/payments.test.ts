import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (...a: unknown[]) => Promise<unknown>;
const sdk = vi.hoisted(() => {
  const list = { autoPagingToArray: vi.fn(async () => []) };
  return {
    paymentIntents: { create: vi.fn<Fn>(async () => ({})), retrieve: vi.fn<Fn>(async () => ({})), update: vi.fn<Fn>(async () => ({})), cancel: vi.fn<Fn>(async () => ({})) },
    charges: { retrieve: vi.fn<Fn>(async () => ({})) },
    refunds: { create: vi.fn<Fn>(async () => ({})), list: vi.fn<(...a: unknown[]) => typeof list>(() => list) },
  };
});
vi.mock("@/lib/stripe/client", () => ({ stripe: sdk }));

import { isAccountUnavailableError, stripeFor, type PaymentsClient } from "@/lib/stripe/payments";

beforeEach(() => vi.clearAllMocks());

type Row = [name: string, run: (c: PaymentsClient) => Promise<unknown>, fn: ReturnType<typeof vi.fn>, optionsIndex: number];

// The whole point of the scoped client: whichever of the seven calls is made,
// the account travels with it. One row per call, so a new method that forgets
// it cannot be added without a row here (the last test counts them).
const calls: Row[] = [
  ["paymentIntents.create", (c) => c.createPaymentIntent({ amount: 1, currency: "mxn" }, "key"), sdk.paymentIntents.create, 1],
  ["paymentIntents.retrieve", (c) => c.retrievePaymentIntent("pi_1"), sdk.paymentIntents.retrieve, 2],
  ["paymentIntents.update", (c) => c.updatePaymentIntent("pi_1", { amount: 2 }), sdk.paymentIntents.update, 2],
  ["paymentIntents.cancel", (c) => c.cancelPaymentIntent("pi_1"), sdk.paymentIntents.cancel, 2],
  ["charges.retrieve", (c) => c.retrieveCharge("ch_1"), sdk.charges.retrieve, 2],
  ["refunds.create", (c) => c.createRefund({ payment_intent: "pi_1" }, "key"), sdk.refunds.create, 1],
  ["refunds.list", (c) => c.listRefunds("ch_1"), sdk.refunds.list, 1],
];

describe("stripeFor", () => {
  it.each(calls)("%s names the connected account", async (_name, run, fn, optionsIndex) => {
    await run(stripeFor("acct_1"));
    expect(fn.mock.calls[0][optionsIndex]).toMatchObject({ stripeAccount: "acct_1" });
  });

  it.each(calls)("%s sends no account header for the platform's own (null)", async (_name, run, fn, optionsIndex) => {
    await run(stripeFor(null));
    expect(fn.mock.calls[0][optionsIndex]).not.toHaveProperty("stripeAccount");
  });

  it("keeps the idempotency key alongside the account", async () => {
    await stripeFor("acct_1").createPaymentIntent({ amount: 1, currency: "mxn" }, "pi_key");
    expect(sdk.paymentIntents.create.mock.calls[0][1]).toEqual({ idempotencyKey: "pi_key", stripeAccount: "acct_1" });
  });

  it("covers every method the scoped client exposes", () => {
    expect(Object.keys(stripeFor("acct_1")).sort()).toEqual([
      "cancelPaymentIntent",
      "createPaymentIntent",
      "createRefund",
      "listRefunds",
      "retrieveCharge",
      "retrievePaymentIntent",
      "updatePaymentIntent",
    ]);
    expect(calls).toHaveLength(7);
  });
});

describe("isAccountUnavailableError", () => {
  it("recognises a permission error and the account codes, and nothing else", () => {
    expect(isAccountUnavailableError({ type: "StripePermissionError" })).toBe(true);
    expect(isAccountUnavailableError({ code: "account_invalid" })).toBe(true);
    expect(isAccountUnavailableError({ type: "StripeConnectionError" })).toBe(false);
    expect(isAccountUnavailableError(new Error("timeout"))).toBe(false);
    expect(isAccountUnavailableError(null)).toBe(false);
    expect(isAccountUnavailableError("account_invalid")).toBe(false);
  });
});
