import { Prisma } from "@/lib/generated/prisma/client";

/**
 * marea_signup() is called through $executeRaw, so its failures arrive as
 * P2010 ("raw query failed") with the real Postgres error nested in
 * meta.driverAdapterError.cause — same shape lib/reservations/prisma-errors.ts
 * already parses for the EXCLUDE constraint, empirically confirmed against
 * @prisma/adapter-pg rather than assumed.
 */
function pgCause(err: unknown): { originalCode?: string; originalMessage?: string } | undefined {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2010") return undefined;
  const meta = err.meta as { driverAdapterError?: { cause?: { originalCode?: string; originalMessage?: string } } } | undefined;
  return meta?.driverAdapterError?.cause;
}

export type SignupSqlError = "slug_taken" | "invalid_slug" | "reserved_slug" | null;

/**
 * Which of marea_signup()'s own checks failed, or null for an error that
 * isn't one of them (a connection problem, a bug) and should propagate
 * as-is. slug_taken is the ordinary unique_violation on Organization.slug
 * (and, equally, Business.slug — this function always gives both the same
 * string, so either constraint reports the same thing); invalid_slug and
 * reserved_slug are the function's own RAISE EXCEPTION messages, the
 * database's copy of lib/business-host.ts's validateSlug().
 */
export function signupSqlError(err: unknown): SignupSqlError {
  const cause = pgCause(err);
  if (!cause) return null;
  if (cause.originalCode === "23505") return "slug_taken";
  if (cause.originalMessage?.startsWith("invalid_slug")) return "invalid_slug";
  if (cause.originalMessage?.startsWith("reserved_slug")) return "reserved_slug";
  return null;
}
