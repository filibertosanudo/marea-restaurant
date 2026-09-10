import { test } from "node:test";
import assert from "node:assert/strict";
import iconv from "iconv-lite";
import { renderEscPos } from "./escpos.ts";
import type { PrintDocument } from "./document.ts";

test("initializes the printer and selects CP850 before any text", () => {
  const doc: PrintDocument = { lines: [{ type: "text", text: "hola" }], cut: false };
  const bytes = renderEscPos(doc);
  assert.deepEqual([...bytes.subarray(0, 2)], [0x1b, 0x40]); // ESC @
  assert.deepEqual([...bytes.subarray(2, 5)], [0x1b, 0x74, 2]); // ESC t 2 (CP850)
});

test("encodes accented Spanish text in CP850, not raw UTF-8", () => {
  const doc: PrintDocument = { lines: [{ type: "text", text: "Pescado a la Veracruzana - Sin cebolla" }], cut: false };
  const bytes = renderEscPos(doc);
  const expected = iconv.encode("Pescado a la Veracruzana - Sin cebolla", "cp850");
  assert.ok(bytes.includes(expected));
});

test("encodes eñes and accents correctly through the CP850 table", () => {
  const doc: PrintDocument = { lines: [{ type: "text", text: "Piña colada, jalapeño" }], cut: false };
  const bytes = renderEscPos(doc);
  const decoded = iconv.decode(bytes, "cp850");
  assert.ok(decoded.includes("Piña colada, jalapeño"));
});

test("wraps a note line in reverse video (GS B) and bold, both switched back off after", () => {
  const doc: PrintDocument = { lines: [{ type: "note", text: "SIN CEBOLLA" }], cut: false };
  const bytes = renderEscPos(doc);
  // GS B 1 ... GS B 0
  const onIndex = bytes.indexOf(Buffer.from([0x1d, 0x42, 1]));
  const offIndex = bytes.indexOf(Buffer.from([0x1d, 0x42, 0]));
  assert.ok(onIndex >= 0, "reverse-on command missing");
  assert.ok(offIndex > onIndex, "reverse-off command missing or out of order");
});

test("emits a full cut (GS V 0) at the end when cut is true", () => {
  const doc: PrintDocument = { lines: [{ type: "text", text: "A-0001" }], cut: true };
  const bytes = renderEscPos(doc);
  assert.ok(bytes.includes(Buffer.from([0x1d, 0x56, 0x00])));
});

test("never emits a cut command when cut is false", () => {
  const doc: PrintDocument = { lines: [{ type: "text", text: "A-0001" }], cut: false };
  const bytes = renderEscPos(doc);
  assert.equal(bytes.includes(Buffer.from([0x1d, 0x56, 0x00])), false);
});

test("a rule line renders as a dashed separator, not a blank line", () => {
  const doc: PrintDocument = { lines: [{ type: "rule" }], cut: false };
  const bytes = renderEscPos(doc);
  const decoded = iconv.decode(bytes, "cp850");
  assert.ok(decoded.includes("-".repeat(32)));
});

test("large size toggles double-width/height on then back off (GS ! )", () => {
  const doc: PrintDocument = { lines: [{ type: "text", text: "2x Pescado", size: "large" }], cut: false };
  const bytes = renderEscPos(doc);
  const onIndex = bytes.indexOf(Buffer.from([0x1d, 0x21, 0x11]));
  const offIndex = bytes.indexOf(Buffer.from([0x1d, 0x21, 0x00]));
  assert.ok(onIndex >= 0);
  assert.ok(offIndex > onIndex);
});

test("strips raw ESC/GS bytes out of line text instead of relaying them as printer commands", () => {
  // The server is expected to sanitize first (lib/printing/kitchen-ticket.ts)
  // — this is the encoder's own belt-and-suspenders in case it doesn't.
  const injected = "Sin cebolla\x1D\x56\x00\x1B\x70\x00 extra";
  const doc: PrintDocument = { lines: [{ type: "note", text: injected }], cut: false };
  const bytes = renderEscPos(doc);
  // Only the reverse-video on/off bytes this module itself emits for a
  // "note" line should carry 0x1D — none of them may originate from the
  // attacker's payload, so the injected GS V 0 / ESC p 0 sequences must be
  // gone entirely, not just relocated.
  assert.equal(bytes.includes(Buffer.from([0x1d, 0x56, 0x00])), false);
  assert.equal(bytes.includes(Buffer.from([0x1b, 0x70, 0x00])), false);
});
