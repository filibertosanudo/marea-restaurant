import { describe, it, expect } from "vitest";
import { buildKitchenTicketDocument } from "./kitchen-ticket";

const BASE = {
  orderNumber: "A-0142",
  tableLabel: "7" as string | null,
  guestCount: null as number | null,
  placedAt: new Date("2026-09-09T18:42:00-06:00"),
  timezone: "America/Hermosillo",
  lang: "es" as const,
  orderNote: null as string | null,
  items: [{ quantity: 2, name: "Pescado a la Veracruzana", notes: "Sin cebolla", modifiers: [] as string[] }],
};

function textOf(doc: ReturnType<typeof buildKitchenTicketDocument>): string {
  return doc.lines
    .filter((l): l is Extract<typeof l, { type: "text" | "note" }> => l.type !== "rule")
    .map((l) => l.text)
    .join("\n");
}

describe("buildKitchenTicketDocument", () => {
  it("never includes a price — no line contains a currency figure", () => {
    const doc = buildKitchenTicketDocument(BASE);
    for (const line of doc.lines) {
      if (line.type === "rule") continue;
      expect(line.text).not.toMatch(/\$\s*\d/);
    }
  });

  it("always ends with a cut", () => {
    const doc = buildKitchenTicketDocument(BASE);
    expect(doc.cut).toBe(true);
  });

  it("renders a per-item note as its own reverse-video line, not folded into the item text", () => {
    const doc = buildKitchenTicketDocument(BASE);
    const noteLines = doc.lines.filter((l) => l.type === "note");
    expect(noteLines).toHaveLength(1);
    expect(noteLines[0].text).toBe("SIN CEBOLLA");
    const itemLine = doc.lines.find((l) => l.type === "text" && l.text.includes("PESCADO"));
    expect(itemLine?.type === "text" && itemLine.text).not.toContain("SIN CEBOLLA");
  });

  it("renders the order-level note separately from any item note", () => {
    const doc = buildKitchenTicketDocument({ ...BASE, orderNote: "Cumpleaños, llevar con vela" });
    const notes = doc.lines.filter((l) => l.type === "note").map((l) => l.text);
    expect(notes).toContain("SIN CEBOLLA");
    expect(notes).toContain("CUMPLEAÑOS, LLEVAR CON VELA");
  });

  it("labels a dine-in order by table, not as takeaway", () => {
    const doc = buildKitchenTicketDocument({ ...BASE, tableLabel: "Mesa 7" });
    expect(textOf(doc)).toContain("MESA 7");
    expect(textOf(doc)).not.toContain("PARA LLEVAR");
  });

  it("labels a null table as takeaway", () => {
    const doc = buildKitchenTicketDocument({ ...BASE, tableLabel: null });
    expect(textOf(doc)).toContain("PARA LLEVAR");
  });

  it("omits the guest-count line entirely when there's no guest count", () => {
    const doc = buildKitchenTicketDocument({ ...BASE, guestCount: null });
    expect(textOf(doc)).not.toMatch(/COMENSALES/);
  });

  it("includes the guest count when present", () => {
    const doc = buildKitchenTicketDocument({ ...BASE, guestCount: 4 });
    expect(textOf(doc)).toContain("4 COMENSALES");
  });

  it("carries the folio number", () => {
    const doc = buildKitchenTicketDocument(BASE);
    expect(textOf(doc)).toContain("A-0142");
  });

  it("strips ESC/GS control bytes from a guest-supplied item note, so it can never be read as a printer command", () => {
    const doc = buildKitchenTicketDocument({
      ...BASE,
      items: [{ ...BASE.items[0], notes: "Sin cebolla\x1D\x56\x00\x1B\x70\x00" }],
    });
    for (const line of doc.lines) {
      if (line.type === "rule") continue;
      expect(line.text).not.toMatch(/[\x00-\x1F\x7F]/);
    }
  });

  it("strips control bytes from a guest-supplied order note", () => {
    const doc = buildKitchenTicketDocument({ ...BASE, orderNote: "Cumpleaños\x1B\x40 sorpresa" });
    const notes = doc.lines.filter((l) => l.type === "note").map((l) => l.text);
    expect(notes.some((t) => /[\x00-\x1F\x7F]/.test(t))).toBe(false);
  });
});
