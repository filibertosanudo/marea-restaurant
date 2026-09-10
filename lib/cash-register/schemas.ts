import { z } from "zod";

const moneyStringSchema = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, "invalid_amount")
  .refine((v) => Number(v) >= 0, "must_be_positive");

export const openCashSessionSchema = z.object({
  openingFloat: moneyStringSchema,
});

export const cashMovementSchema = z.object({
  type: z.enum(["DEPOSIT", "WITHDRAWAL"]),
  amount: moneyStringSchema.refine((v) => Number(v) > 0, "must_be_greater_than_zero"),
  reason: z.string().trim().min(1, "required").max(280),
});

export const closeCashSessionSchema = z.object({
  countedAmount: moneyStringSchema,
  notes: z.string().trim().max(500).optional(),
});
