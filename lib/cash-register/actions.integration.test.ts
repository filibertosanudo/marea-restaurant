import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { openCashSessionAction, recordCashMovementAction, closeCashSessionAction } from "./actions";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { runConcurrently, partitionSettled } from "@/test/concurrency";

function makeCurrentBusiness() {
  return makeBusiness({ slug: "marea" });
}

async function loginAs(role: "STAFF" | "BUSINESS_ADMIN") {
  const user = await makeStaff(role);
  setTestSession(sessionUserFromRow(user));
  return user;
}

describe("openCashSessionAction", () => {
  it("rejects a caller outside STAFF_ROLES", async () => {
    await makeCurrentBusiness();
    const customer = await makeStaff("CUSTOMER");
    setTestSession(sessionUserFromRow(customer));

    await expect(openCashSessionAction("1000.00")).rejects.toThrow();
  });

  it("rejects a malformed opening float", async () => {
    await makeCurrentBusiness();
    await loginAs("STAFF");

    expect(await openCashSessionAction("not-a-number")).toEqual({ error: "invalid_amount" });
  });

  it("opens a session with the given float", async () => {
    const business = await makeCurrentBusiness();
    const cashier = await loginAs("STAFF");

    const result = await openCashSessionAction("1000.00");

    expect(result).toBeUndefined();
    const session = await prisma.cashSession.findFirstOrThrow({ where: { businessId: business.id } });
    expect(session.openingFloat.toString()).toBe("1000");
    expect(session.openedById).toBe(cashier.id);
    expect(session.closedAt).toBeNull();
  });

  it("rejects opening a second session while one is already open", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");
    await openCashSessionAction("1000.00");

    const result = await openCashSessionAction("500.00");

    expect(result).toEqual({ error: "already_open" });
    expect(await prisma.cashSession.count({ where: { businessId: business.id } })).toBe(1);
  });

  it("under a concurrent double-open, exactly one succeeds — the partial unique index is the real guarantee", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");

    const results = await runConcurrently([
      () => openCashSessionAction("1000.00"),
      () => openCashSessionAction("1000.00"),
    ]);
    const { fulfilled } = partitionSettled(results);

    expect(fulfilled).toHaveLength(2);
    const succeeded = fulfilled.filter((r) => r === undefined);
    expect(succeeded).toHaveLength(1);
    expect(await prisma.cashSession.count({ where: { businessId: business.id, closedAt: null } })).toBe(1);
  });
});

describe("recordCashMovementAction", () => {
  it("rejects when no shift is open", async () => {
    await makeCurrentBusiness();
    await loginAs("STAFF");

    const result = await recordCashMovementAction({ type: "WITHDRAWAL", amount: "50.00", reason: "test" });

    expect(result).toEqual({ error: "no_open_cash_session" });
  });

  it("rejects a blank reason", async () => {
    await makeCurrentBusiness();
    await loginAs("STAFF");
    await openCashSessionAction("1000.00");

    const result = await recordCashMovementAction({ type: "WITHDRAWAL", amount: "50.00", reason: "   " });

    expect(result).toEqual({ error: "invalid_input" });
  });

  it("records a withdrawal against the open session", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");
    await openCashSessionAction("1000.00");
    const session = await prisma.cashSession.findFirstOrThrow({ where: { businessId: business.id } });

    const result = await recordCashMovementAction({
      type: "WITHDRAWAL",
      amount: "350.00",
      reason: "pago a proveedor de verduras",
    });

    expect(result).toBeUndefined();
    const movement = await prisma.cashMovement.findFirstOrThrow({ where: { cashSessionId: session.id } });
    expect(movement.type).toBe("WITHDRAWAL");
    expect(movement.amount.toString()).toBe("350");
  });
});

describe("closeCashSessionAction", () => {
  it("rejects when no shift is open", async () => {
    await makeCurrentBusiness();
    await loginAs("STAFF");

    const result = await closeCashSessionAction({ countedAmount: "1000.00" });

    expect(result).toEqual({ ok: false, error: "no_open_cash_session" });
  });

  it("closes with zero difference and no note required", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");
    await openCashSessionAction("1000.00");

    const result = await closeCashSessionAction({ countedAmount: "1000.00" });

    expect(result).toMatchObject({ ok: true, difference: "0.00" });
    const session = await prisma.cashSession.findFirstOrThrow({ where: { businessId: business.id } });
    expect(session.closedAt).not.toBeNull();
    expect(session.expectedAmount!.toString()).toBe("1000");
    expect(session.difference!.toString()).toBe("0");
  });

  it("requires a note when the count doesn't match the expected amount", async () => {
    await makeCurrentBusiness();
    await loginAs("STAFF");
    await openCashSessionAction("1000.00");

    const withoutNote = await closeCashSessionAction({ countedAmount: "950.00" });
    expect(withoutNote).toEqual({ ok: false, error: "note_required" });

    const withNote = await closeCashSessionAction({ countedAmount: "950.00", notes: "faltó cambio de una cuenta" });
    expect(withNote).toMatchObject({ ok: true, difference: "-50.00" });
  });

  it("computes the expected amount from the float, cash collected, deposits, and withdrawals", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("STAFF");
    await openCashSessionAction("1000.00");
    const session = await prisma.cashSession.findFirstOrThrow({ where: { businessId: business.id } });

    const order = await prisma.order.create({ data: { businessId: business.id, orderNumber: "A-0001", total: "1950.00" } });
    await prisma.payment.create({
      data: {
        businessId: business.id,
        orderId: order.id,
        provider: "CASH_REGISTER",
        status: "SUCCEEDED",
        amount: "1950.00",
        cashSessionId: session.id,
      },
    });
    await recordCashMovementAction({ type: "WITHDRAWAL", amount: "350.00", reason: "pago a proveedor" });

    // 1000 (float) + 1950 (cash) + 0 (deposits) - 350 (withdrawal) = 2600
    const result = await closeCashSessionAction({ countedAmount: "2600.00" });

    expect(result).toMatchObject({ ok: true, difference: "0.00" });
  });

  it("cannot be closed twice", async () => {
    await makeCurrentBusiness();
    await loginAs("STAFF");
    await openCashSessionAction("1000.00");
    await closeCashSessionAction({ countedAmount: "1000.00" });

    const result = await closeCashSessionAction({ countedAmount: "1000.00" });

    expect(result).toEqual({ ok: false, error: "no_open_cash_session" });
  });
});
