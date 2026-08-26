import { Prisma } from "@/lib/generated/prisma/client";

/**
 * True for a violation of reservation_no_overlap (the Postgres EXCLUDE
 * constraint from the add_reservation_no_overlap_exclude migration) — the
 * real "two guests just took the same table" race, as opposed to a
 * validation the app already caught. Prisma has no dedicated error code for
 * EXCLUDE constraints (only P2002 for UNIQUE); empirically it surfaces as
 * P2039 with the driver's own Postgres error (SQLSTATE 23P01,
 * exclusion_violation) nested in `meta`, so this checks both rather than
 * trusting P2039 alone to keep meaning what it means today.
 */
export function isExclusionConstraintError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== "P2039") return false;

  const meta = err.meta as { driverAdapterError?: { cause?: { code?: string; originalCode?: string } } } | undefined;
  const pgCode = meta?.driverAdapterError?.cause?.originalCode ?? meta?.driverAdapterError?.cause?.code;
  return pgCode === "23P01";
}
