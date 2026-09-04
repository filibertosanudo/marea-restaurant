import { describe, it, expect } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { toCategoryListDTO, toTagDTO, toMenuItemListDTO, toModifierOptionDTO, toModifierGroupDTO } from "./menu";

describe("toCategoryListDTO", () => {
  it("picks the requested locale's name and reports the missing one", () => {
    const dto = toCategoryListDTO(
      {
        id: "cat_1",
        slug: "mains",
        isActive: true,
        sortOrder: 0,
        translations: [{ locale: "en", name: "Mains", description: "" }],
        _count: { items: 3 },
      } as never,
      "en"
    );
    expect(dto.name).toBe("Mains");
    expect(dto.itemCount).toBe(3);
    expect(dto.missingLocales).toEqual(["es"]);
  });

  it("falls back to the slug when no translation exists at all", () => {
    const dto = toCategoryListDTO(
      { id: "cat_1", slug: "mains", isActive: true, sortOrder: 0, translations: [], _count: { items: 0 } } as never,
      "en"
    );
    expect(dto.name).toBe("mains");
  });
});

describe("toTagDTO", () => {
  it("falls back to the slug when the requested locale is missing", () => {
    const dto = toTagDTO(
      { id: "tag_1", slug: "vegan", color: "#0a0", translations: [{ locale: "es", label: "Vegano" }] } as never,
      "en"
    );
    expect(dto.label).toBe("vegan");
  });
});

describe("toMenuItemListDTO", () => {
  it("carries category name, tag ids, and modifier group ids together", () => {
    const dto = toMenuItemListDTO(
      {
        id: "item_1",
        slug: "lobster",
        categoryId: "cat_1",
        basePrice: new Prisma.Decimal("42.00"),
        compareAtPrice: null,
        imageUrl: null,
        isAvailable: true,
        isFeatured: false,
        translations: [{ locale: "en", name: "Lobster", description: "", imageAlt: "" }],
        category: { slug: "mains", translations: [{ locale: "en", name: "Mains" }] },
        tags: [{ tag: { id: "tag_1", slug: "spicy", color: null, translations: [] } }],
        modifierGroups: [{ groupId: "group_1" }],
      } as never,
      "en"
    );

    expect(dto.name).toBe("Lobster");
    expect(dto.categoryName).toBe("Mains");
    expect(dto.basePrice).toBe("42.00");
    expect(dto.tagIds).toEqual(["tag_1"]);
    expect(dto.modifierGroupIds).toEqual(["group_1"]);
  });
});

describe("toModifierOptionDTO", () => {
  it("carries priceDelta as a formatted string", () => {
    const dto = toModifierOptionDTO(
      {
        id: "opt_1",
        slug: "large",
        groupId: "group_1",
        priceDelta: new Prisma.Decimal("15.00"),
        isAvailable: true,
        isDefault: false,
        translations: [{ locale: "en", name: "Large" }],
      } as never,
      "en"
    );
    expect(dto.priceDelta).toBe("15.00");
    expect(dto.name).toBe("Large");
  });
});

describe("toModifierGroupDTO", () => {
  it("nests option DTOs and carries the applied-to count", () => {
    const dto = toModifierGroupDTO(
      {
        id: "group_1",
        slug: "size",
        selectionType: "SINGLE",
        isRequired: true,
        minSelections: 1,
        maxSelections: 1,
        translations: [{ locale: "en", name: "Size", helpText: "Pick one" }],
        options: [
          {
            id: "opt_1",
            slug: "large",
            groupId: "group_1",
            priceDelta: new Prisma.Decimal("0"),
            isAvailable: true,
            isDefault: true,
            translations: [{ locale: "en", name: "Large" }],
          },
        ],
        _count: { menuItems: 4 },
      } as never,
      "en"
    );

    expect(dto.name).toBe("Size");
    expect(dto.appliedToCount).toBe(4);
    expect(dto.options).toHaveLength(1);
    expect(dto.options[0].name).toBe("Large");
  });
});
