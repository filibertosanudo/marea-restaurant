import { z } from "zod";

export const checkoutSchema = z.object({
  guestName: z.string().trim().min(1).max(120),
  guestPhone: z.string().trim().min(5).max(30),
  guestEmail: z
    .union([z.email().max(200), z.literal("")])
    .optional()
    .transform((v) => (v ? v : undefined)),
  notes: z.string().trim().max(500).optional(),
});
