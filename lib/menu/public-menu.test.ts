import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { toPublicMenuByLang } from "./public-menu";

function rawCategory() {
  return {
    id: "cat_1",
    slug: "mains",
    translations: [{ locale: "en", name: "Mains" }],
    items: [
      {
        id: "item_1",
        slug: "lobster-thermidor",
        basePrice: new Prisma.Decimal("42.00"),
        compareAtPrice: null,
        translations: [{ locale: "en", name: "Lobster Thermidor", description: "Classic." }],
        tags: [{ tag: { id: "tag_1", slug: "spicy", color: "#f00", translations: [{ locale: "en", label: "Spicy" }] } }],
        modifierGroups: [],
      },
    ],
  };
}

describe("toPublicMenuByLang", () => {
  it("formats an integer price without decimals for the landing display", () => {
    const menu = toPublicMenuByLang([rawCategory()] as never);
    expect(menu.en.dishes[0].price).toBe("$42");
    expect(menu.en.dishes[0].priceValue).toBe("42.00");
  });

  it("falls back to whatever translation exists when the requested locale has none", () => {
    // pickTranslation's own rule: the requested locale, else the first one
    // that exists (never the slug while any translation is there at all).
    const menu = toPublicMenuByLang([rawCategory()] as never);
    expect(menu.es.dishes[0].name).toBe("Lobster Thermidor");
    expect(menu.es.categories[0].label).toBe("Mains");
  });

  it("falls back to the slug when there's no translation at all", () => {
    const category = rawCategory();
    category.translations = [];
    category.items[0].translations = [];
    const menu = toPublicMenuByLang([category] as never);
    expect(menu.en.dishes[0].name).toBe("lobster-thermidor");
    expect(menu.en.categories[0].label).toBe("mains");
  });

  it("carries tags with their own per-locale label", () => {
    const menu = toPublicMenuByLang([rawCategory()] as never);
    expect(menu.en.dishes[0].tags[0].label).toBe("Spicy");
  });
});
