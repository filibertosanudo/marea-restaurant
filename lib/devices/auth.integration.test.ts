import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness } from "@/test/factories";
import { requireDevice, DeviceAuthError } from "./auth";
import { generateDeviceToken, hashDeviceToken } from "./token";

function requestWith(authorization: string | null): Request {
  const headers: Record<string, string> = {};
  if (authorization !== null) headers.authorization = authorization;
  return new Request("http://localhost/api/agent/print-jobs/claim", { method: "POST", headers });
}

async function makeDevice(businessId: string, overrides: { isActive?: boolean } = {}) {
  const { token, tokenHash } = generateDeviceToken();
  const device = await prisma.device.create({
    data: { businessId, name: "Impresora cocina", tokenHash, isActive: overrides.isActive ?? true },
  });
  return { device, token };
}

describe("requireDevice", () => {
  it("resolves the device for a valid bearer token and stamps lastSeenAt", async () => {
    const business = await makeBusiness();
    const { device, token } = await makeDevice(business.id);

    const resolved = await requireDevice(requestWith(`Bearer ${token}`));

    expect(resolved.id).toBe(device.id);
    const updated = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(updated.lastSeenAt).not.toBeNull();
    expect(Date.now() - updated.lastSeenAt!.getTime()).toBeLessThan(5000);
  });

  it("rejects a missing Authorization header", async () => {
    await expect(requireDevice(requestWith(null))).rejects.toBeInstanceOf(DeviceAuthError);
  });

  it("rejects a non-Bearer scheme", async () => {
    const business = await makeBusiness();
    const { token } = await makeDevice(business.id);
    await expect(requireDevice(requestWith(`Basic ${token}`))).rejects.toBeInstanceOf(DeviceAuthError);
  });

  it("rejects a token that doesn't match any device", async () => {
    await expect(requireDevice(requestWith("Bearer not-a-real-token"))).rejects.toBeInstanceOf(DeviceAuthError);
  });

  it("rejects a deactivated device even with its correct token", async () => {
    const business = await makeBusiness();
    const { token } = await makeDevice(business.id, { isActive: false });
    await expect(requireDevice(requestWith(`Bearer ${token}`))).rejects.toBeInstanceOf(DeviceAuthError);
  });

  it("stops accepting the old token the instant it's rotated", async () => {
    const business = await makeBusiness();
    const { device, token: oldToken } = await makeDevice(business.id);

    const { token: newToken, tokenHash: newHash } = generateDeviceToken();
    await prisma.device.update({ where: { id: device.id }, data: { tokenHash: newHash, tokenRotatedAt: new Date() } });

    await expect(requireDevice(requestWith(`Bearer ${oldToken}`))).rejects.toBeInstanceOf(DeviceAuthError);
    const resolved = await requireDevice(requestWith(`Bearer ${newToken}`));
    expect(resolved.id).toBe(device.id);
  });
});

describe("generateDeviceToken / hashDeviceToken", () => {
  it("hashes deterministically — the same token always hashes the same way", () => {
    const { token, tokenHash } = generateDeviceToken();
    expect(hashDeviceToken(token)).toBe(tokenHash);
  });

  it("never generates the same token twice", () => {
    const a = generateDeviceToken();
    const b = generateDeviceToken();
    expect(a.token).not.toBe(b.token);
  });
});
