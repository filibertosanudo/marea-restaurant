/**
 * A restaurant's accountant opens this in Excel, not this panel — so cells
 * carry plain numeric strings ("1234.56"), never a formatted "$1,234.56
 * MXN", or a SUM() over the column breaks. The UTF-8 BOM is what keeps
 * Excel from mangling accented dish names and headers; without it, Excel
 * guesses the system codepage and "Camarones al mojo de ajo" comes out
 * garbled.
 */
const UTF8_BOM = "﻿";

function escapeCsvField(value: string | number): string {
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(","));
  return UTF8_BOM + lines.join("\r\n") + "\r\n";
}
