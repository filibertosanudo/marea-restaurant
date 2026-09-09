import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processQueue } from "@/lib/notifications/queue";

const BATCH_LIMIT = 20;

function isAuthorized(request: Request): boolean {
  if (!env.CRON_SECRET) return false;
  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const expected = Buffer.from(env.CRON_SECRET);
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * The serverless execution mode for the notification queue: a platform's
 * own scheduler (Vercel Cron, a GitHub Actions cron step, anything that
 * can hit a URL on a timer) calls this instead of running
 * scripts/worker.ts as a long-lived process. Both call the exact same
 * processQueue() — see that function's own header comment.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await processQueue(BATCH_LIMIT);
  return NextResponse.json(result);
}
