import { NextResponse } from "next/server";
import { requireDevice, DeviceAuthError } from "@/lib/devices/auth";
import { claimPrintJobs } from "@/lib/printing/queue";

const CLAIM_LIMIT = 10;

/** The agent's poll loop. No session, no cookie — a Bearer device token is the entire auth story, per this module's rule that the agent never gets database credentials. */
export async function POST(request: Request) {
  try {
    const device = await requireDevice(request);
    const jobs = await claimPrintJobs(device.businessId, device.id, CLAIM_LIMIT);
    return NextResponse.json({
      jobs: jobs.map((job) => ({ id: job.id, kind: job.kind, document: job.payload })),
    });
  } catch (err) {
    if (err instanceof DeviceAuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
