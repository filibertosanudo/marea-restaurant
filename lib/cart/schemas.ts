import { z } from "zod";

export const addToCartSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(20),
  optionIds: z.array(z.string().min(1)).max(50).default([]),
  notes: z.string().trim().max(280).optional(),
});

export const updateCartItemQuantitySchema = z.object({
  cartItemId: z.string().min(1),
  quantity: z.coerce.number().int().min(0).max(20),
});
