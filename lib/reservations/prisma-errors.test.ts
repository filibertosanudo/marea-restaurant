import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { isSlotConflictError } from "./prisma-errors";

function makeKnownRequestError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "test", meta });
}

describe("isSlotConflictError", () => {
  it("recognizes the deadlock two racing inserts produce, in the shape Prisma reports it", () => {
    // Captured from Postgres 17 through @prisma/adapter-pg: a deadlock is also P2039.
    const err = makeKnownRequestError("P2039", {
      driverAdapterError: { cause: { originalCode: "40P01", originalMessage: "deadlock detected", code: "40P01" } },
    });
    expect(isSlotConflictError(err)).toBe(true);
  });

  it("recognizes the reservation_no_overlap violation shape", () => {
    const err = makeKnownRequestError("P2039", {
      driverAdapterError: { cause: { originalCode: "23P01" } },
    });
    expect(isSlotConflictError(err)).toBe(true);
  });

  it("also accepts the driver's own `code` field, not just `originalCode`", () => {
    const err = makeKnownRequestError("P2039", { driverAdapterError: { cause: { code: "23P01" } } });
    expect(isSlotConflictError(err)).toBe(true);
  });

  it("rejects a P2039 for a different underlying Postgres error", () => {
    const err = makeKnownRequestError("P2039", { driverAdapterError: { cause: { originalCode: "23505" } } });
    expect(isSlotConflictError(err)).toBe(false);
  });

  it("rejects a different Prisma error code entirely", () => {
    const err = makeKnownRequestError("P2002", { driverAdapterError: { cause: { originalCode: "23P01" } } });
    expect(isSlotConflictError(err)).toBe(false);
  });

  it("rejects a plain, non-Prisma error", () => {
    expect(isSlotConflictError(new Error("not prisma"))).toBe(false);
  });
});
