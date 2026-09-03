import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import packageJson from "@/package.json";

/** No auth — a load balancer only checks the status code, not a JSON field, so a real failure has to come back as 503, never 200 with `ok: false` buried inside. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: true, version: packageJson.version });
  } catch {
    return NextResponse.json({ ok: false, db: false, version: packageJson.version }, { status: 503 });
  }
}
