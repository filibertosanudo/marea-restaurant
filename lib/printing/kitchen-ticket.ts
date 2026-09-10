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
 * ESC (0x1B) and GS (0x1D) are exactly the prefix bytes the agent's own
 * ESC/POS encoder uses for bold/size/align/reverse/cut — nothing upstream
 * of this module filters raw bytes out of free text (checkoutSchema and
 * addToCartSchema only trim and cap length), so an anonymous guest's order
 * or item note could otherwise smuggle a real printer command (a
 * cash-drawer kick, a stray cut) into the middle of a ticket. Stripping
 * every C0 control byte and DEL here — the one place all of a ticket's
 * text passes through before becoming a PrintLine — means no future field
 * added to this document can reach the printer's command bytes either.
 */
function sanitizeText(text: string): string {
  return text.replace(/[\x00-\x1F\x7F]/g, "");
}

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
    { type: "text", text: sanitizeText(`${input.orderNumber}    ${timeLabel}`), bold: true, size: "large" },
    {
      type: "text",
      text: input.tableLabel ? sanitizeText(input.tableLabel.toUpperCase()) : t.takeaway,
      bold: true,
    },
  ];

  if (input.guestCount) {
    lines.push({ type: "text", text: t.guests(input.guestCount) });
  }

  lines.push({ type: "rule" });

  for (const item of input.items) {
    lines.push({
      type: "text",
      text: sanitizeText(`${item.quantity}x ${item.name}`.toUpperCase()),
      bold: true,
      size: "large",
    });
    if (item.modifiers.length > 0) {
      lines.push({ type: "text", text: sanitizeText(item.modifiers.join(" / ").toUpperCase()) });
    }
    if (item.notes) {
      lines.push({ type: "note", text: sanitizeText(item.notes.toUpperCase()) });
    }
  }

  if (input.orderNote) {
    lines.push({ type: "rule" });
    lines.push({ type: "note", text: sanitizeText(input.orderNote.toUpperCase()) });
  }

  lines.push({ type: "rule" });

  return { lines, cut: true };
}
