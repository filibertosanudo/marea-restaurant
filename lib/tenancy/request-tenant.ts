import "server-only";
import { headers } from "next/headers";
import { explicitTenant, TENANT_HEADER } from "@/lib/tenancy/context";

/**
 * The business the current database connection should act for: an explicit
 * runInTenant() scope, else the header proxy.ts stamped on the request.
 * Outside a request (no headers to read) there is none, and that is the
 * safe answer: the policy then lets nothing through.
 */
export async function currentTenant(): Promise<string | null> {
  const explicit = explicitTenant();
  if (explicit !== undefined) return explicit || null;
  try {
    return (await headers()).get(TENANT_HEADER) || null;
  } catch {
    return null;
  }
}
