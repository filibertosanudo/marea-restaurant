import { toIntlLocale } from "@/lib/dto/money";
import type { Lang } from "@/lib/i18n/lang";
import type { PrintDocument, PrintLine } from "@/lib/printing/document";

export type KitchenTicketInput = {
  orderNumber: string;
  tableLabel: string | null;
  guestCount: number | null;
  placedAt: Date;
  timezone: string;
  lang: Lang;
  orderNote: string | null;
  items: {
    quantity: number;
    name: string;
    notes: string | null;
    modifiers: string[];
  }[];
};

const DICT = {
  es: { title: "COCINA", subtitle: "NO ES COMPROBANTE DE VENTA", takeaway: "PARA LLEVAR", guests: (n: number) => `${n} COMENSALES` },
  en: { title: "KITCHEN", subtitle: "NOT A SALES RECEIPT", takeaway: "TAKEAWAY", guests: (n: number) => `${n} GUESTS` },
} as const;

/**
 * The kitchen comanda — no prices, ever (that's CUSTOMER_RECEIPT, a
 * separate template, not this one with a flag). Per-item notes render
 * right under the dish they modify, not grouped at the bottom, because
 * that's what makes "sin cebolla" survive contact with a busy line: it has
 * to sit where the cook is already looking, not compete for a second read.
 */
export function buildKitchenTicketDocument(input: KitchenTicketInput): PrintDocument {
  const t = DICT[input.lang] ?? DICT.es;
  const timeLabel = new Intl.DateTimeFormat(toIntlLocale(input.lang), {
    timeZone: input.timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(input.placedAt);

  const lines: PrintLine[] = [
    { type: "text", text: t.title, bold: true, align: "center" },
    { type: "text", text: t.subtitle, align: "center" },
    { type: "rule" },
    { type: "text", text: `${input.orderNumber}    ${timeLabel}`, bold: true, size: "large" },
    {
      type: "text",
      text: input.tableLabel ? input.tableLabel.toUpperCase() : t.takeaway,
      bold: true,
    },
  ];

  if (input.guestCount) {
    lines.push({ type: "text", text: t.guests(input.guestCount) });
  }

  lines.push({ type: "rule" });

  for (const item of input.items) {
    lines.push({ type: "text", text: `${item.quantity}x ${item.name}`.toUpperCase(), bold: true, size: "large" });
    if (item.modifiers.length > 0) {
      lines.push({ type: "text", text: item.modifiers.join(" / ").toUpperCase() });
    }
    if (item.notes) {
      lines.push({ type: "note", text: item.notes.toUpperCase() });
    }
  }

  if (input.orderNote) {
    lines.push({ type: "rule" });
    lines.push({ type: "note", text: input.orderNote.toUpperCase() });
  }

  lines.push({ type: "rule" });

  return { lines, cut: true };
}
