import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { makeBusiness, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { createDeviceAction, rotateDeviceTokenAction, setDeviceActiveAction } from "./actions";
import { hashDeviceToken } from "./token";

// getCurrentBusiness() resolves by a fixed slug, same as board-actions.ts.
function makeCurrentBusiness() {
  return makeBusiness({ slug: "marea" });
}

async function loginAs(role: "STAFF" | "BUSINESS_ADMIN") {
  const user = await makeStaff(role);
  setTestSession(sessionUserFromRow(user));
  return user;
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("createDeviceAction", () => {
  it("creates a device and returns its raw token exactly once", async () => {
    await makeCurrentBusiness();
    await loginAs("BUSINESS_ADMIN");

    const result = await createDeviceAction(undefined, formData({ name: "Impresora cocina" }));

    expect(result && "success" in result).toBe(true);
    if (!result || !("success" in result)) throw new Error("expected success");
    const device = await prisma.device.findFirst({ where: { name: "Impresora cocina" } });
    expect(device).not.toBeNull();
    expect(device?.tokenHash).toBe(hashDeviceToken(result.token));
  });

  it("rejects STAFF — provisioning a credential is admin-only, same as creating a teammate", async () => {
    await makeCurrentBusiness();
    await loginAs("STAFF");

    await expect(createDeviceAction(undefined, formData({ name: "Impresora cocina" }))).rejects.toThrow();
  });

  it("rejects an empty name", async () => {
    await makeCurrentBusiness();
    await loginAs("BUSINESS_ADMIN");

    const result = await createDeviceAction(undefined, formData({ name: "" }));

    expect(result && "error" in result).toBe(true);
  });
});

describe("rotateDeviceTokenAction", () => {
  it("overwrites the hash so the old token stops authenticating immediately", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("BUSINESS_ADMIN");
    const device = await prisma.device.create({
      data: { businessId: business.id, name: "Impresora cocina", tokenHash: "old-hash" },
    });

    const result = await rotateDeviceTokenAction(device.id);

    expect(result.ok).toBe(true);
    const updated = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(updated.tokenHash).not.toBe("old-hash");
    if (result.ok) expect(updated.tokenHash).toBe(hashDeviceToken(result.token));
  });

  it("scopes to the caller's own business", async () => {
    const business = await makeCurrentBusiness();
    const otherBusiness = await makeBusiness();
    await loginAs("BUSINESS_ADMIN");
    const device = await prisma.device.create({
      data: { businessId: otherBusiness.id, name: "Impresora ajena", tokenHash: "old-hash" },
    });
    void business;

    const result = await rotateDeviceTokenAction(device.id);

    expect(result.ok).toBe(false);
    const untouched = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(untouched.tokenHash).toBe("old-hash");
  });
});

describe("setDeviceActiveAction", () => {
  it("deactivates without deleting the row — PrintJob history keeps meaning", async () => {
    const business = await makeCurrentBusiness();
    await loginAs("BUSINESS_ADMIN");
    const device = await prisma.device.create({
      data: { businessId: business.id, name: "Impresora cocina", tokenHash: "hash-1" },
    });

    await setDeviceActiveAction(device.id, false);

    const updated = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(updated.isActive).toBe(false);
  });
});
