import { Prisma } from "@/lib/generated/prisma/client";

/** True for a Prisma unique-constraint violation (P2002) — used to detect "already inserted this exact row" races instead of treating them as real failures. */
export function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}
