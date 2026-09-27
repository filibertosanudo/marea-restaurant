import { Prisma } from "@/lib/generated/prisma/client";

// Postgres codes that mean "another transaction is taking this table for this
// time": exclusion_violation from reservation_no_overlap, and deadlock_detected.
// The second is the same race: an EXCLUDE constraint checks a new row after
// inserting it, so when two conflicting inserts each land before either checks,
// each waits for the other and Postgres aborts one of them with 40P01 instead of
// 23P01. Measured with two plain connections on Postgres 17 that is the usual
// outcome of a tight race (about 9 in 10), not a rarity. Prisma reports both
// as P2039.
const SLOT_CONFLICT_PG_CODES = new Set(["23P01", "40P01"]);

/**
 * True when a failed write lost the race for a table: a violation of
 * reservation_no_overlap (the Postgres EXCLUDE constraint from the
 * add_reservation_no_overlap_exclude migration) or the deadlock two such
 * inserts can produce. Either is the real "two guests just took the same
 * table" case, as opposed to a validation the app already caught. Prisma has
 * no dedicated error code for these (only P2002 for UNIQUE); empirically both
 * surface as P2039 with the driver's own Postgres error (SQLSTATE) nested in
 * `meta`, so this checks both rather than trusting P2039 alone to keep meaning
 * what it means today.
 */
export function isSlotConflictError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== "P2039") return false;

  const meta = err.meta as { driverAdapterError?: { cause?: { code?: string; originalCode?: string } } } | undefined;
  const pgCode = meta?.driverAdapterError?.cause?.originalCode ?? meta?.driverAdapterError?.cause?.code;
  return pgCode !== undefined && SLOT_CONFLICT_PG_CODES.has(pgCode);
}
