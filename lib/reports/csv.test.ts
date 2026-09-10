import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("starts with a UTF-8 BOM so Excel reads accents correctly", () => {
    const csv = toCsv(["Platillo"], [["Camarones al mojo de ajo"]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it("joins rows with CRLF and comma-separates fields", () => {
    const csv = toCsv(["Dish", "Units"], [["Ceviche", 5]]);
    expect(csv).toBe("﻿Dish,Units\r\nCeviche,5\r\n");
  });

  it("quotes a field containing a comma and doubles internal quotes", () => {
    const csv = toCsv(["Reason"], [['cambio de "más" en la mesa, no confirmado']]);
    expect(csv).toContain('"cambio de ""más"" en la mesa, no confirmado"');
  });

  it("quotes a field containing a newline", () => {
    const csv = toCsv(["Notes"], [["line one\nline two"]]);
    expect(csv).toContain('"line one\nline two"');
  });
});
