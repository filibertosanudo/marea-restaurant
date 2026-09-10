import { NextResponse } from "next/server";
import { requireDevice, DeviceAuthError } from "@/lib/devices/auth";
import { markPrintJobSent } from "@/lib/printing/queue";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const device = await requireDevice(request);
    const { id } = await params;
    await markPrintJobSent(id, device.businessId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DeviceAuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
