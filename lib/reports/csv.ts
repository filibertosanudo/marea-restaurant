/**
 * A restaurant's accountant opens this in Excel, not this panel — so cells
 * carry plain numeric strings ("1234.56"), never a formatted "$1,234.56
 * MXN", or a SUM() over the column breaks. The UTF-8 BOM is what keeps
 * Excel from mangling accented dish names and headers; without it, Excel
 * guesses the system codepage and "Camarones al mojo de ajo" comes out
 * garbled.
 */
const UTF8_BOM = "﻿";

// A cell whose text starts with one of these is what Excel/Sheets/LibreOffice
// read as a formula, not literal text (CWE-1236 / OWASP "CSV injection") —
// free-text fields here (a cancellation or refund reason) are staff-written
// and end up in a file this codebase's own convention hands to someone
// outside the app entirely (the restaurant's accountant, in Excel).
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;
// A clean number (including a legitimately negative one, e.g. "-50.00")
// starts with the same characters as a formula trigger but isn't one —
// never neutralize those, or a real negative amount would print as text.
const PURE_NUMBER = /^-?\d+(\.\d+)?$/;

function escapeCsvField(value: string | number): string {
  let str = String(value);
  if (typeof value === "string" && FORMULA_TRIGGER.test(str) && !PURE_NUMBER.test(str)) {
    str = `'${str}`;
  }
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(","));
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}
