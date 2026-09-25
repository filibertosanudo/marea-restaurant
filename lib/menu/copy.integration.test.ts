import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import type { StorageDriver } from "@/lib/storage/driver";
import { copyMenuFromBusinessAction } from "@/lib/menu/copy-actions";
import { copyMenu } from "@/lib/menu/copy";
import { makeBusiness, makeMembership, makeOrgAdmin, makeOrganization, makeStaff } from "@/test/factories";
import { setTestSession, sessionUserFromRow } from "@/test/stubs/auth-session";
import { setTestTenantHeader } from "@/test/stubs/next-headers";

// An in-memory storage: keys map to bytes, urls are /media/<key>.
const files = new Map<string, Buffer>();
const storage: StorageDriver = {
  async put({ body, key }) {
    files.set(key, body);
    return { key, url: `/media/${key}` };
  },
  async get(key) {
    const body = files.get(key);
    return body ? { body, contentType: "image/webp" } : null;
  },
  async delete(key) {
    files.delete(key);
  },
  publicUrl: (key) => `/media/${key}`,
  keyFromUrl: (url) => (url.startsWith("/media/") ? url.slice("/media/".length) : null),
  async list() {
    return [...files.keys()];
  },
};
vi.mock("@/lib/storage", () => ({ getStorageDriver: () => storage }));

beforeEach(() => {
  files.clear();
});

async function seedMenu(businessId: string) {
  files.set("menu-items/original.webp", Buffer.from("photo-bytes"));
  const tag = await prisma.tag.create({
    data: { businessId, slug: "spicy", color: "#f00", translations: { create: [{ locale: "en", label: "Spicy" }, { locale: "es", label: "Picante" }] } },
  });
  const group = await prisma.modifierGroup.create({
    data: {
      businessId,
      slug: "size",
      isRequired: true,
      translations: { create: [{ locale: "en", name: "Size" }, { locale: "es", name: "Tamaño" }] },
      options: {
        create: [
          { slug: "small", priceDelta: "0.00", isDefault: true, translations: { create: [{ locale: "en", name: "Small" }] } },
          { slug: "large", priceDelta: "2.50", translations: { create: [{ locale: "en", name: "Large" }] } },
        ],
      },
    },
  });
  const category = await prisma.menuCategory.create({
    data: { businessId, slug: "mains", sortOrder: 1, translations: { create: [{ locale: "en", name: "Mains" }, { locale: "es", name: "Fuertes" }] } },
  });
  const item = await prisma.menuItem.create({
    data: {
      businessId,
      categoryId: category.id,
      slug: "ceviche",
      basePrice: "12.00",
      imageUrl: "/media/menu-items/original.webp",
      trackInventory: true,
      stockQuantity: 40,
      translations: { create: [{ locale: "en", name: "Ceviche", description: "Fresh" }, { locale: "es", name: "Ceviche", description: "Fresco" }] },
      tags: { create: [{ tagId: tag.id }] },
      modifierGroups: { create: [{ groupId: group.id, sortOrder: 1 }] },
    },
  });
  // A soft-deleted dish must not travel.
  await prisma.menuItem.create({
    data: { businessId, categoryId: category.id, slug: "old", basePrice: "1.00", deletedAt: new Date(), translations: { create: [{ locale: "en", name: "Old" }] } },
  });
  return { item };
}

describe("copyMenu", () => {
  it("copies categories, dishes, tags, modifiers and translations into an empty branch, as new rows", async () => {
    const from = await makeBusiness({ slug: "from" });
    const to = await makeBusiness({ slug: "to" });
    await seedMenu(from.id);

    const result = await copyMenu({ sourceBusinessId: from.id, targetBusinessId: to.id, storage });

    expect(result).toEqual({ ok: true, categories: 1, dishes: 1, photos: 1 });
    const copied = await prisma.menuItem.findFirstOrThrow({
      where: { businessId: to.id },
      include: { translations: true, tags: { include: { tag: true } }, modifierGroups: { include: { group: { include: { options: true, translations: true } } } }, category: true },
    });
    expect(copied.slug).toBe("ceviche");
    expect(copied.basePrice.toString()).toBe("12");
    expect(copied.translations.map((t) => t.locale).sort()).toEqual(["en", "es"]);
    expect(copied.tags.map((t) => t.tag.slug)).toEqual(["spicy"]);
    expect(copied.tags[0].tag.businessId).toBe(to.id);
    expect(copied.modifierGroups[0].group.businessId).toBe(to.id);
    expect(copied.modifierGroups[0].group.options.map((o) => o.slug).sort()).toEqual(["large", "small"]);
    expect(copied.category.businessId).toBe(to.id);
    // Stock is not menu; the soft-deleted dish stayed behind.
    expect(copied).toMatchObject({ trackInventory: false, stockQuantity: 0 });
    expect(await prisma.menuItem.count({ where: { businessId: to.id } })).toBe(1);
    // And the source is exactly as it was.
    expect(await prisma.menuItem.count({ where: { businessId: from.id } })).toBe(2);
  });

  it("copies the photo under a new key, so removing one branch's photo cannot remove the other's", async () => {
    const from = await makeBusiness({ slug: "from" });
    const to = await makeBusiness({ slug: "to" });
    await seedMenu(from.id);

    await copyMenu({ sourceBusinessId: from.id, targetBusinessId: to.id, storage });

    const copied = await prisma.menuItem.findFirstOrThrow({ where: { businessId: to.id } });
    const original = await prisma.menuItem.findFirstOrThrow({ where: { businessId: from.id, slug: "ceviche" } });
    expect(copied.imageUrl).not.toBe(original.imageUrl);
    const copiedKey = storage.keyFromUrl(copied.imageUrl!)!;
    await storage.delete(copiedKey);
    expect(files.has("menu-items/original.webp")).toBe(true);
  });

  it("refuses to merge into a menu that already has something, and copies nothing", async () => {
    const from = await makeBusiness({ slug: "from" });
    const to = await makeBusiness({ slug: "to" });
    await seedMenu(from.id);
    await prisma.menuCategory.create({ data: { businessId: to.id, slug: "existing" } });

    expect(await copyMenu({ sourceBusinessId: from.id, targetBusinessId: to.id, storage })).toEqual({ ok: false, error: "target_not_empty" });
    expect(await prisma.menuItem.count({ where: { businessId: to.id } })).toBe(0);
  });

  it("says so when the source has no menu", async () => {
    const from = await makeBusiness({ slug: "from" });
    const to = await makeBusiness({ slug: "to" });
    expect(await copyMenu({ sourceBusinessId: from.id, targetBusinessId: to.id, storage })).toEqual({ ok: false, error: "source_empty" });
  });

  it("removes the photos it already copied when a later one fails, and writes nothing", async () => {
    const from = await makeBusiness({ slug: "from" });
    const to = await makeBusiness({ slug: "to" });
    const { item } = await seedMenu(from.id);
    files.set("menu-items/second.webp", Buffer.from("more-bytes"));
    await prisma.menuItem.create({
      data: { businessId: from.id, categoryId: item.categoryId, slug: "second", basePrice: "5.00", imageUrl: "/media/menu-items/second.webp", translations: { create: [{ locale: "en", name: "Second" }] } },
    });
    const before = new Set(files.keys());
    let puts = 0;
    const flaky: StorageDriver = {
      ...storage,
      async put(input) {
        if (++puts === 2) throw new Error("disk full");
        return storage.put(input);
      },
    };

    await expect(copyMenu({ sourceBusinessId: from.id, targetBusinessId: to.id, storage: flaky })).rejects.toThrow("disk full");

    expect(new Set(files.keys())).toEqual(before);
    expect(await prisma.menuItem.count({ where: { businessId: to.id } })).toBe(0);
  });
});

describe("copyMenuFromBusinessAction", () => {
  async function chain() {
    const org = await makeOrganization();
    const rivalOrg = await makeOrganization();
    const a = await makeBusiness({ slug: "a", organizationId: org.id });
    const b = await makeBusiness({ slug: "b", organizationId: org.id });
    const rival = await makeBusiness({ slug: "rival", organizationId: rivalOrg.id });
    return { org, a, b, rival };
  }

  it("lets the owner of a chain copy one branch's menu into another", async () => {
    const { org, a, b } = await chain();
    await seedMenu(a.id);
    const owner = await makeOrgAdmin(org.id);
    setTestSession(sessionUserFromRow(owner, { role: "BUSINESS_ADMIN", businessId: b.id, orgAdmin: true }));
    setTestTenantHeader(b.id);

    const result = await copyMenuFromBusinessAction(a.id);

    expect(result).toMatchObject({ ok: true, dishes: 1 });
    expect(await prisma.menuItem.count({ where: { businessId: b.id } })).toBe(1);
  });

  it("refuses another chain's business, and never reads its menu", async () => {
    const { org, b, rival } = await chain();
    await seedMenu(rival.id);
    const owner = await makeOrgAdmin(org.id);
    setTestSession(sessionUserFromRow(owner, { role: "BUSINESS_ADMIN", businessId: b.id, orgAdmin: true }));
    setTestTenantHeader(b.id);

    expect(await copyMenuFromBusinessAction(rival.id)).toEqual({ ok: false, error: "forbidden" });
    expect(await prisma.menuItem.count({ where: { businessId: b.id } })).toBe(0);
  });

  it("needs an administrator at the source too, not just at the branch being filled", async () => {
    const { a, b } = await chain();
    await seedMenu(a.id);
    const person = await makeStaff("CUSTOMER");
    await makeMembership(person.id, b.id, { role: "BUSINESS_ADMIN" });
    await makeMembership(person.id, a.id, { role: "STAFF" });
    setTestSession(sessionUserFromRow(person, { role: "BUSINESS_ADMIN", businessId: b.id }));
    setTestTenantHeader(b.id);

    expect(await copyMenuFromBusinessAction(a.id)).toEqual({ ok: false, error: "forbidden" });
  });

  it("refuses to copy a business into itself, and a signed-out or STAFF caller", async () => {
    const { a } = await chain();
    const waiter = await makeStaff("CUSTOMER");
    await makeMembership(waiter.id, a.id, { role: "STAFF" });
    setTestSession(sessionUserFromRow(waiter, { role: "STAFF", businessId: a.id }));
    setTestTenantHeader(a.id);
    await expect(copyMenuFromBusinessAction(a.id)).rejects.toThrow("Insufficient role");

    const admin = await makeStaff("CUSTOMER");
    await makeMembership(admin.id, a.id, { role: "BUSINESS_ADMIN" });
    setTestSession(sessionUserFromRow(admin, { role: "BUSINESS_ADMIN", businessId: a.id }));
    expect(await copyMenuFromBusinessAction(a.id)).toEqual({ ok: false, error: "same_business" });
  });
});
