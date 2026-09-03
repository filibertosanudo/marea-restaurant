import { z } from "zod";

export const tableSchema = z.object({
  code: z.string().trim().min(1).max(20),
  zone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
  seats: z.coerce.number().int().min(1).max(50),
});

/**
 * Batch creation is the normal case for a table's first setup (see
 * docs/prompts/06-mesas-y-configuracion.md — nobody adds twelve tables one
 * at a time). `codePrefix` + a generated sequence number produce each
 * table's `code`; the actual starting number is computed server-side from
 * existing codes, not sent by the client.
 */
export const batchTableSchema = z.object({
  zone: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
  seats: z.coerce.number().int().min(1).max(50),
  quantity: z.coerce.number().int().min(1).max(50),
  codePrefix: z.string().trim().min(1).max(10),
});
