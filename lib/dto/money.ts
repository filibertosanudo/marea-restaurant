import type { Prisma } from "@/lib/generated/prisma/client";

/** Prisma.Decimal never crosses to a Client Component — stringify at the DTO boundary. */
export function decimalToString(value: Prisma.Decimal | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.toFixed(2);
}

export function formatMoney(value: string | number, currency: string, locale: string): string {
  const amount = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US", {
    style: "currency",
    currency,
  }).format(amount);
}
