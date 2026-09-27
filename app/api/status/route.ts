import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { buildHealthReport } from "@/lib/ops/health";

function isAuthorized(request: Request): boolean {
  if (!env.STATUS_CHECK_TOKEN) return false;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const expected = Buffer.from(env.STATUS_CHECK_TOKEN);
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * What the external monitor watches — /api/health stays the balancer's own
 * check (database reachable, process answering) and never fails on any of
 * this, per its own comment: a diner ordering food is not affected by a
 * stale backup or a slow queue, so the balancer must never pull the site
 * out of rotation over either.
 *
 * The status code alone is public: 200 means every check below passed, 503
 * means at least one did not — that is all an uptime monitor needs, and all
 * a stranger gets. The breakdown of which check failed and why is handed
 * only to a request bearing STATUS_CHECK_TOKEN; every failure is logged
 * either way, so it is never only visible to whoever holds the token.
 */
export async function GET(request: Request) {
  const report = await buildHealthReport();
  if (!report.ok) {
    console.warn("[status] degraded:", JSON.stringify(report.checks.filter((c) => !c.ok)));
  }

  const status = report.ok ? 200 : 503;
  if (isAuthorized(request)) {
    return NextResponse.json(report, { status });
  }
  return NextResponse.json({ ok: report.ok }, { status });
}
