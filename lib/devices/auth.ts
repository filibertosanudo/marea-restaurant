import "server-only";
import { prisma } from "@/lib/prisma";
import { hashDeviceToken } from "@/lib/devices/token";
import type { Device } from "@/lib/generated/prisma/client";

export class DeviceAuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "DeviceAuthError";
  }
}

/**
 * Bearer-token gate for app/api/agent/* routes — requireRole()'s equivalent
 * for a caller with no NextAuth session, because it isn't a browser: it's a
 * process on a machine inside the restaurant's own network. Also stamps
 * lastSeenAt on every call, whether or not there was work to claim — that's
 * the heartbeat the admin panel reads to say the printer is still there.
 */
export async function requireDevice(request: Request): Promise<Device> {
  const auth = request.headers.get("authorization") ?? "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new DeviceAuthError("Missing bearer token");
  }

  const tokenHash = hashDeviceToken(token);
  const device = await prisma.device.findUnique({ where: { tokenHash } });
  if (!device || !device.isActive) {
    throw new DeviceAuthError("Invalid or inactive device token");
  }

  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date() },
  });

  return device;
}
