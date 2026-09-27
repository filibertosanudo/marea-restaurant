import "server-only";
import { prisma } from "@/lib/prisma";

export type ReadOnlyStatus = { enabled: boolean; reason: string | null };

/** Thrown by assertWritable(); a readable message a caller can show as-is. */
export class ReadOnlyModeError extends Error {
  reason: string | null;
  constructor(reason: string | null) {
    super(reason ? `This deployment is in maintenance mode: ${reason}` : "This deployment is in maintenance mode. Please try again shortly.");
    this.name = "ReadOnlyModeError";
    this.reason = reason;
  }
}

// A few seconds: long enough that a mutation-heavy page doesn't add a query
// per request, short enough that turning it on or off from a command (never
// a deploy) takes effect for everyone within one request round trip or two.
const CACHE_TTL_MS = 5_000;
let cached: (ReadOnlyStatus & { expiresAt: number }) | null = null;

async function loadPlatformReadOnly(): Promise<ReadOnlyStatus> {
  const row = await prisma.readOnlyMode.findFirst({ where: { scope: "PLATFORM" }, select: { reason: true } });
  return { enabled: row !== null, reason: row?.reason ?? null };
}

/** Whether the whole deployment is read-only right now — cached a few seconds, never a query per call. */
export async function isPlatformReadOnly(now = Date.now()): Promise<ReadOnlyStatus> {
  if (cached && cached.expiresAt > now) return { enabled: cached.enabled, reason: cached.reason };
  const status = await loadPlatformReadOnly();
  cached = { ...status, expiresAt: now + CACHE_TTL_MS };
  return status;
}

/** Test-only: forces the next isPlatformReadOnly() call to hit the database again. */
export function clearReadOnlyCache(): void {
  cached = null;
}

/**
 * The one check every mutation makes before doing anything else — requireRole
 * calls it first, so every role-gated Server Action and route handler is
 * covered without change; the handful of guest-facing actions that don't go
 * through requireRole call it (or isPlatformReadOnly directly, for a typed
 * result instead of a throw) themselves, as their own first line.
 *
 * `organizationId` is module 19's seam: a per-organization row (subscription
 * lapsed, graceful read-only before suspension) will be read here too once
 * it exists. Nothing writes one yet, so passing it today is a no-op.
 */
export async function assertWritable(organizationId?: string): Promise<void> {
  const platform = await isPlatformReadOnly();
  if (platform.enabled) throw new ReadOnlyModeError(platform.reason);
  void organizationId; // module 19 checks the organization's own row here
}
