import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCsvBytes, parseCsv } from "./csv";

const fixture = (name: string) => new Uint8Array(readFileSync(path.resolve(import.meta.dirname, "__fixtures__", name)));

describe("decodeCsvBytes", () => {
  it("reads what Excel with a Spanish locale writes: Windows-1252, accents intact", () => {
    const text = decodeCsvBytes(fixture("excel-es-windows-1252.csv"));
    expect(text).toContain("Categoría;Nombre;Precio;Descripción");
    expect(text).toContain("Crème brûlée");
    expect(text).not.toContain("�");
  });

  it("drops a UTF-8 BOM and keeps the text", () => {
    const text = decodeCsvBytes(fixture("excel-utf8-bom.csv"));
    expect(text.startsWith("Category,Name")).toBe(true);
    expect(text).toContain("Año nuevo");
  });

  it("reads UTF-16 with a BOM (Excel's \"Unicode text\")", () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("nombre;precio\r\nCafé;38", "utf16le")]);
    expect(decodeCsvBytes(bytes)).toBe("nombre;precio\r\nCafé;38");
  });
});

describe("parseCsv", () => {
  it("splits on the semicolon a Spanish Excel writes, and keeps a quoted thousands comma in one cell", () => {
    const rows = parseCsv(decodeCsvBytes(fixture("excel-es-windows-1252.csv")));
    expect(rows[0]).toEqual(["Categoría", "Nombre", "Precio", "Descripción"]);
    expect(rows[2]).toEqual(["Platos fuertes", "Enchiladas verdes", "$1,250.00", "Bañadas en salsa verde"]);
    expect(rows).toHaveLength(5);
  });

  it("handles quotes, a comma inside one, doubled quotes, newlines in a cell, and blank lines", () => {
    const rows = parseCsv('a,b\r\n"x, y","He said ""hi"""\r\n\r\n"line\nbreak",z');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'He said "hi"'],
      ["line\nbreak", "z"],
    ]);
  });

  it("honours Excel's own sep= line", () => {
    expect(parseCsv("sep=|\r\na|b\r\n1|2")).toEqual([
      ["a|b"].flatMap(() => ["a", "b"]),
      ["1", "2"],
    ]);
  });
});
