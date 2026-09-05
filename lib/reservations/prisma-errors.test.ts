import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { isExclusionConstraintError } from "./prisma-errors";

function makeKnownRequestError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "test", meta });
}

describe("isExclusionConstraintError", () => {
  it("recognizes the reservation_no_overlap violation shape", () => {
    const err = makeKnownRequestError("P2039", {
      driverAdapterError: { cause: { originalCode: "23P01" } },
    });
    expect(isExclusionConstraintError(err)).toBe(true);
  });

  it("also accepts the driver's own `code` field, not just `originalCode`", () => {
    const err = makeKnownRequestError("P2039", { driverAdapterError: { cause: { code: "23P01" } } });
    expect(isExclusionConstraintError(err)).toBe(true);
  });

  it("rejects a P2039 for a different underlying Postgres error", () => {
    const err = makeKnownRequestError("P2039", { driverAdapterError: { cause: { originalCode: "23505" } } });
    expect(isExclusionConstraintError(err)).toBe(false);
  });

  it("rejects a different Prisma error code entirely", () => {
    const err = makeKnownRequestError("P2002", { driverAdapterError: { cause: { originalCode: "23P01" } } });
    expect(isExclusionConstraintError(err)).toBe(false);
  });

  it("rejects a plain, non-Prisma error", () => {
    expect(isExclusionConstraintError(new Error("not prisma"))).toBe(false);
  });
});
