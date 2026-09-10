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

  it("neutralizes a leading = so a spreadsheet program can't read it as a formula", () => {
    const csv = toCsv(["Reason"], [['=cmd|"/c calc.exe"!A1']]);
    expect(csv).toContain(`'=cmd|`);
  });

  it("neutralizes other formula-trigger characters: + - @ tab", () => {
    for (const value of ["+1+1", "-1+1", "@SUM(A1:A9)", "\tsneaky"]) {
      const csv = toCsv(["Reason"], [[value]]);
      expect(csv).toContain(`'${value}`);
    }
  });

  it("never neutralizes a clean number, including a legitimately negative one", () => {
    expect(toCsv(["Amount"], [["-50.00"]])).toContain("\r\n-50.00\r\n");
    expect(toCsv(["Amount"], [["23.19"]])).toContain("\r\n23.19\r\n");
  });

  it("never neutralizes a numeric-typed value, even a negative one", () => {
    const csv = toCsv(["Delta"], [[-5]]);
    expect(csv).toContain("\r\n-5\r\n");
  });
});
