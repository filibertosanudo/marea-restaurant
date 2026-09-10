import iconv from "iconv-lite";
import type { PrintDocument, PrintLine } from "./document.ts";

const ESC = 0x1b;
const GS = 0x1d;

const INIT = Buffer.from([ESC, 0x40]);

/**
 * CP850 (Multilingual Latin-1, Epson code-page table value 2) is a widely
 * supported ESC/POS page that covers Spanish accents and ñ. Without an
 * explicit select the printer defaults to a US code page and every
 * accented character prints as the wrong glyph — the exact failure this
 * module's own plan calls out as the first thing to get right, before
 * anything else about the ticket.
 */
const SELECT_CODEPAGE_CP850 = Buffer.from([ESC, 0x74, 2]);
const CODEPAGE = "cp850";

const LF = Buffer.from([0x0a]);
// GS V 0 — full cut. Without this the next comanda prints stuck to this one.
const FULL_CUT = Buffer.from([GS, 0x56, 0x00]);

function bold(on: boolean): Buffer {
  return Buffer.from([ESC, 0x45, on ? 1 : 0]);
}

function doubleSize(on: boolean): Buffer {
  return Buffer.from([GS, 0x21, on ? 0x11 : 0x00]);
}

function align(a: "left" | "center"): Buffer {
  return Buffer.from([ESC, 0x61, a === "center" ? 1 : 0]);
}

/** White-on-black — GS B — the one line meant to be impossible to miss. */
function reverse(on: boolean): Buffer {
  return Buffer.from([GS, 0x42, on ? 1 : 0]);
}

/**
 * Belt-and-suspenders against the server sending (or a future server bug
 * re-introducing) a line whose text carries raw C0/DEL bytes: this encoder
 * is the one place that actually knows 0x1B/0x1D start a real command, so
 * it strips them regardless of what already happened upstream in
 * lib/printing/kitchen-ticket.ts on the server side of this repo.
 */
function stripControlBytes(text: string): string {
  return text.replace(/[\x00-\x1F\x7F]/g, "");
}

function encodeText(text: string): Buffer {
  return iconv.encode(stripControlBytes(text), CODEPAGE);
}

function renderLine(line: PrintLine): Buffer[] {
  if (line.type === "rule") {
    return [encodeText("-".repeat(32)), LF];
  }
  if (line.type === "note") {
    return [reverse(true), bold(true), encodeText(line.text), bold(false), reverse(false), LF];
  }

  const out: Buffer[] = [];
  if (line.align === "center") out.push(align("center"));
  if (line.bold) out.push(bold(true));
  if (line.size === "large") out.push(doubleSize(true));
  out.push(encodeText(line.text));
  if (line.size === "large") out.push(doubleSize(false));
  if (line.bold) out.push(bold(false));
  if (line.align === "center") out.push(align("left"));
  out.push(LF);
  return out;
}

/** Turns a server-resolved PrintDocument into raw ESC/POS bytes — the only place in this whole system that knows a printer protocol exists. */
export function renderEscPos(document: PrintDocument): Buffer {
  const parts: Buffer[] = [INIT, SELECT_CODEPAGE_CP850];
  for (const line of document.lines) {
    parts.push(...renderLine(line));
  }
  if (document.cut) {
    parts.push(LF, LF, LF, FULL_CUT);
  }
  return Buffer.concat(parts);
}
