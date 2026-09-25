import "server-only";
import { prisma } from "@/lib/prisma";
import { hashDeviceToken } from "@/lib/devices/token";
import { businessIdForDeviceTokenHash } from "@/lib/tenancy/discover";
import { runInTenant } from "@/lib/tenancy/context";
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

/**
 * requireDevice() plus everything the route does afterwards, acting for the
 * device's business. The token is the only thing the agent presents, so the
 * business is found from it first (lib/tenancy/discover.ts) and the rest of
 * the request runs inside that business, under the row level security
 * policies like any other request.
 */
export async function withDevice<T>(request: Request, handler: (device: Device) => Promise<T>): Promise<T> {
  const auth = request.headers.get("authorization") ?? "";
  const [scheme, token] = auth.split(" ");
  if (scheme !== "Bearer" || !token) {
    throw new DeviceAuthError("Missing bearer token");
  }
  const businessId = await businessIdForDeviceTokenHash(hashDeviceToken(token));
  if (!businessId) throw new DeviceAuthError("Invalid or inactive device token");
  return runInTenant(businessId, async () => handler(await requireDevice(request)));
}
