import { NextResponse } from "next/server";
import { requireDevice, DeviceAuthError } from "@/lib/devices/auth";
import { findClaimedPrintJob, markPrintJobFailedOrRetry } from "@/lib/printing/queue";

/** The printer accepted the TCP connection but never confirmed a print, no paper, a timeout, a socket error. The agent reports why; this schedules the same backoff lib/notifications/queue.ts uses for the same reason. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const device = await requireDevice(request);
    const { id } = await params;
    const body: unknown = await request.json().catch(() => ({}));
    const message =
      typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error.slice(0, 500)
        : "unknown agent error";

    const job = await findClaimedPrintJob(id, device.businessId);
    if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

    await markPrintJobFailedOrRetry(job, message);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DeviceAuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
