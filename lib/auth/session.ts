import "server-only";
import { cache } from "react";
import { auth } from "@/auth";

/**
 * The `jwt` callback re-checks the membership in the database once the
 * token goes stale (see auth.ts, REVALIDATE_INTERVAL_MS) — that query must
 * stay amortized, not run once per auth() call site. React's cache() dedupes
 * it within a single request: layout.tsx and a page's requirePageRole() (or
 * requireRole() in a Server Action) can each call getSession() and only the
 * first actually hits next-auth/the database.
 */
export const getSession = cache(() => auth());
