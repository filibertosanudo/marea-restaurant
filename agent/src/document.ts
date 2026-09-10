/**
 * Mirrors lib/printing/document.ts on the server side of this repo — kept
 * as its own copy on purpose. This package has no dependency on the main
 * app (no Next, no Prisma, no shared node_modules — see agent/README.md),
 * so the two type files are the contract between them, not a shared
 * import. If the server's shape changes, this one has to change too; a
 * TypeScript error here is exactly what should surface a mismatch.
 */
export type PrintTextLine = {
  type: "text";
  text: string;
  bold?: boolean;
  size?: "normal" | "large";
  align?: "left" | "center";
};

export type PrintNoteLine = {
  type: "note";
  text: string;
};

export type PrintRuleLine = { type: "rule" };

export type PrintLine = PrintTextLine | PrintRuleLine | PrintNoteLine;

export type PrintDocument = {
  lines: PrintLine[];
  cut: boolean;
};
