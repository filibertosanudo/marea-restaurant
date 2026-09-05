import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createModifierGroupAction,
  updateModifierGroupAction,
  deleteModifierGroupAction,
  createModifierOptionAction,
  updateModifierOptionAction,
  deleteModifierOptionAction,
} from "./modifier-actions";
import { makeBusiness, makeMenuItem, makeMenuCategory, makeModifierGroup, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";

async function loginAsAdmin() {
  const user = await makeStaff("BUSINESS_ADMIN");
  setTestSession(sessionUserFromRow(user));
}

function groupForm(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("createModifierGroupAction / updateModifierGroupAction", () => {
  it("creates a group with a derived slug", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();

    const result = await createModifierGroupAction(
      undefined,
      groupForm({ "en.name": "Size", "es.name": "", helpText: "", selectionType: "SINGLE", minSelections: "1" })
    );

    expect(result).toEqual({ success: true });
    const group = await prisma.modifierGroup.findFirstOrThrow({ where: { businessId: business.id } });
    expect(group.slug).toBe("size");
    expect(group.minSelections).toBe(1);
  });

  it("updates an existing group's translation and selection rules", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const group = await makeModifierGroup(business.id, { selectionType: "SINGLE" });

    const result = await updateModifierGroupAction(
      undefined,
      groupForm({
        id: group.id,
        "en.name": "Size",
        "es.name": "",
        helpText: "Pick one",
        selectionType: "MULTIPLE",
        minSelections: "0",
        maxSelections: "3",
      })
    );

    expect(result).toEqual({ success: true });
    const updated = await prisma.modifierGroup.findUniqueOrThrow({ where: { id: group.id } });
    expect(updated.selectionType).toBe("MULTIPLE");
    expect(updated.maxSelections).toBe(3);
  });
});

describe("deleteModifierGroupAction", () => {
  it("blocks deleting a group still applied to a menu item", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const category = await makeMenuCategory(business.id);
    const item = await makeMenuItem(business.id, category.id);
    const group = await makeModifierGroup(business.id);
    await prisma.menuItemModifierGroup.create({ data: { menuItemId: item.id, groupId: group.id } });

    const result = await deleteModifierGroupAction(group.id);

    expect(result).toEqual({ blocked: true });
  });

  it("soft-deletes a group applied to nothing", async () => {
    const business = await makeBusiness({ slug: "marea" });
    await loginAsAdmin();
    const group = await makeModifierGroup(business.id);

    const result = await deleteModifierGroupAction(group.id);

    expect(result).toEqual({ blocked: false });
    const updated = await prisma.modifierGroup.findUniqueOrThrow({ where: { id: group.id } });
    expect(updated.deletedAt).not.toBeNull();
  });
});

describe("createModifierOptionAction / updateModifierOptionAction / deleteModifierOptionAction", () => {
  it("creates an option under a group", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const group = await makeModifierGroup(business.id);

    const result = await createModifierOptionAction(
      undefined,
      groupForm({ groupId: group.id, "en.name": "Large", "es.name": "", priceDelta: "15.00" })
    );

    expect(result).toEqual({ success: true });
    const option = await prisma.modifierOption.findFirstOrThrow({ where: { groupId: group.id } });
    expect(option.slug).toBe("large");
    expect(option.priceDelta.toString()).toBe("15");
  });

  it("reports not_found when the group doesn't belong to this business", async () => {
    await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const otherBusiness = await makeBusiness();
    const foreignGroup = await makeModifierGroup(otherBusiness.id);

    const result = await createModifierOptionAction(
      undefined,
      groupForm({ groupId: foreignGroup.id, "en.name": "Large", "es.name": "", priceDelta: "0" })
    );

    expect(result).toEqual({ error: "not_found" });
  });

  it("updates and then soft-deletes an option", async () => {
    const business = await makeBusiness({ slug: "marea", defaultLocale: "en" });
    await loginAsAdmin();
    const group = await makeModifierGroup(business.id);
    const option = await prisma.modifierOption.create({ data: { groupId: group.id, slug: "large" } });

    const updateResult = await updateModifierOptionAction(
      undefined,
      groupForm({ id: option.id, groupId: group.id, "en.name": "Extra Large", "es.name": "", priceDelta: "20.00" })
    );
    expect(updateResult).toEqual({ success: true });
    const updated = await prisma.modifierOption.findUniqueOrThrow({ where: { id: option.id } });
    expect(updated.priceDelta.toString()).toBe("20");

    await deleteModifierOptionAction(option.id);
    const deleted = await prisma.modifierOption.findUniqueOrThrow({ where: { id: option.id } });
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.isAvailable).toBe(false);
  });
});
