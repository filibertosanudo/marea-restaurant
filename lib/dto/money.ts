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

/**
 * Cent-integer arithmetic for money strings in Client Components, where
 * Prisma.Decimal can't be imported (it pulls Node built-ins into the
 * browser bundle). Only ever used for an optimistic client-side preview —
 * the server re-reads the catalog and computes the authoritative total with
 * Prisma.Decimal regardless of what this shows.
 */
export function addMoneyStrings(...values: string[]): string {
  const totalCents = values.reduce((sum, v) => sum + Math.round(Number(v) * 100), 0);
  return (totalCents / 100).toFixed(2);
}

export function mulMoneyString(value: string, quantity: number): string {
  const cents = Math.round(Number(value) * 100) * quantity;
  return (cents / 100).toFixed(2);
}
