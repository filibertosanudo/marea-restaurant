import { z } from "zod";
import type { Lang } from "@/lib/i18n/lang";
import { isAllowedImageUrl } from "@/lib/env";

// The business's default locale is the only one that's required; the rest
// are optional but the UI flags them as incomplete. Schemas take the
// default locale as a parameter instead of hardcoding "es" so this stays
// correct if Business.defaultLocale ever changes — see docs/DATABASE.md.

function localizedText(defaultLocale: Lang) {
  const required = z.object({
    name: z.string().min(1, "Required").max(120),
    description: z.string().max(2000).optional().default(""),
  });
  const optional = z.object({
    name: z.string().max(120).optional().default(""),
    description: z.string().max(2000).optional().default(""),
  });
  return z.object({
    en: defaultLocale === "en" ? required : optional,
    es: defaultLocale === "es" ? required : optional,
  });
}

function localizedTextWithImageAlt(defaultLocale: Lang) {
  const imageAlt = z.string().max(200).optional().default("");
  const required = z.object({
    name: z.string().min(1, "Required").max(120),
    description: z.string().max(2000).optional().default(""),
    imageAlt,
  });
  const optional = z.object({
    name: z.string().max(120).optional().default(""),
    description: z.string().max(2000).optional().default(""),
    imageAlt,
  });
  return z.object({
    en: defaultLocale === "en" ? required : optional,
    es: defaultLocale === "es" ? required : optional,
  });
}

export function buildCategorySchema(defaultLocale: Lang) {
  return z.object({
    id: z.string().optional(),
    translations: localizedText(defaultLocale),
    isActive: z.boolean().default(true),
  });
}

export function buildMenuItemSchema(defaultLocale: Lang) {
  return z.object({
    id: z.string().optional(),
    categoryId: z.string().min(1, "Required"),
    basePrice: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Invalid price")
      .refine((v) => Number(v) >= 0, "Must be positive"),
    compareAtPrice: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, "Invalid price")
      .optional()
      .or(z.literal("")),
    imageUrl: z
      .string()
      .url()
      .refine(isAllowedImageUrl, "Must be an https url on an allowed host")
      .optional()
      .or(z.literal("")),
    isAvailable: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    translations: localizedTextWithImageAlt(defaultLocale),
    tagIds: z.array(z.string()).default([]),
    modifierGroupIds: z.array(z.string()).default([]),
  });
}

function localizedName(defaultLocale: Lang, maxLen: number) {
  const required = z.object({ name: z.string().min(1, "Required").max(maxLen) });
  const optional = z.object({ name: z.string().max(maxLen).optional().default("") });
  return z.object({
    en: defaultLocale === "en" ? required : optional,
    es: defaultLocale === "es" ? required : optional,
  });
}

export function buildModifierGroupSchema(defaultLocale: Lang) {
  return z.object({
    id: z.string().optional(),
    translations: localizedName(defaultLocale, 80),
    helpText: z.string().max(200).optional().default(""),
    selectionType: z.enum(["SINGLE", "MULTIPLE"]),
    isRequired: z.boolean().default(false),
    minSelections: z.coerce.number().int().min(0).default(0),
    maxSelections: z.coerce.number().int().min(1).optional(),
  });
}

export function buildModifierOptionSchema(defaultLocale: Lang) {
  return z.object({
    id: z.string().optional(),
    groupId: z.string().min(1),
    translations: localizedName(defaultLocale, 80),
    priceDelta: z
      .string()
      .regex(/^-?\d+(\.\d{1,2})?$/, "Invalid amount")
      .default("0"),
    isAvailable: z.boolean().default(true),
    isDefault: z.boolean().default(false),
  });
}
