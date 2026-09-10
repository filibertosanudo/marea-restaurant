import type { Device, DeviceKind } from "@/lib/generated/prisma/client";

export type DeviceDTO = {
  id: string;
  name: string;
  kind: DeviceKind;
  isActive: boolean;
  lastSeenAt: string | null;
  tokenRotatedAt: string;
  createdAt: string;
};

/** tokenHash never leaves the server — the raw token itself is shown exactly once, at creation or rotation, never read back afterward. */
export function toDeviceDTO(device: Device): DeviceDTO {
  return {
    id: device.id,
    name: device.name,
    kind: device.kind,
    isActive: device.isActive,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    tokenRotatedAt: device.tokenRotatedAt.toISOString(),
    createdAt: device.createdAt.toISOString(),
  };
}
