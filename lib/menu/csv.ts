/**
 * Reading the file a restaurant saves from Excel (module 19, phase 5): the
 * bytes are not always UTF-8 and the separator is not always a comma. A
 * parser that only reads the CSV its author generated in the tests does not
 * work, so every guess here is one a real Excel on Windows makes:
 *
 * - encoding: UTF-8 with or without a BOM, UTF-16 ("Unicode text"), and
 *   otherwise Windows-1252, which is what "CSV" means in Excel with a Spanish
 *   locale. Tried in that order; UTF-8 is strict, so a Latin-1 "é" is not
 *   silently swallowed as a replacement character.
 * - separator: Spanish-locale Excel writes ";" (the comma is the decimal
 *   mark there). Read from the header line, or from Excel's own "sep=;" line.
 * - quoting: RFC 4180, including doubled quotes and newlines inside a cell.
 */

export function decodeCsvBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const DELIMITERS = [",", ";", "\t"] as const;

function detectDelimiter(text: string): { delimiter: string; body: string } {
  const sep = /^sep=(.)\r?\n/i.exec(text);
  if (sep) return { delimiter: sep[1], body: text.slice(sep[0].length) };

  const firstLine = text.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  let inQuotes = false;
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let best: string = ",";
  for (const delimiter of DELIMITERS) {
    if ((counts.get(delimiter) ?? 0) > (counts.get(best) ?? 0)) best = delimiter;
  }
  return { delimiter: best, body: text };
}

/** Rows of cells, blank lines dropped. The first row is the header. */
export function parseCsv(text: string): string[][] {
  const { delimiter, body } = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (inQuotes) {
      if (char === '"') {
        if (body[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      inQuotes = true;
    } else if (char === delimiter) {
      endCell();
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && body[i + 1] === "\n") i += 1;
      endRow();
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) endRow();
  return rows;
}
