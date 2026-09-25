import { NextResponse } from "next/server";
import { withDevice, DeviceAuthError } from "@/lib/devices/auth";
import { markPrintJobSent } from "@/lib/printing/queue";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return await withDevice(request, async (device) => {
      await markPrintJobSent(id, device.businessId);
      return NextResponse.json({ ok: true });
    });
  } catch (err) {
    if (err instanceof DeviceAuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw err;
  }
}
