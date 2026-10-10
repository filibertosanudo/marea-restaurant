/**
 * A price as someone typed it in a spreadsheet, to the "1250.00" the menu
 * schema takes: "$1,250.00", "1.250,50", "1250", "12,5", "MXN 99". Null when it
 * is not a price. The rule for a lone separator is the one thing that cannot be
 * known: followed by exactly three digits it is a thousands mark ("1,250"),
 * anything else is the decimal mark ("12,5", "99.90"), because a price has at
 * most two decimals. The preview shows the parsed value next to the original,
 * so a wrong guess is seen before anything is written.
 */
export function parsePrice(raw: string): string | null {
  const cleaned = raw.replace(/\s|\$|MXN|USD|MN/gi, "");
  if (!/^\d[\d.,]*$/.test(cleaned)) return null;

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");
  let decimalMark: "." | "," | null = null;
  if (lastDot >= 0 && lastComma >= 0) {
    decimalMark = lastDot > lastComma ? "." : ",";
  } else if (lastDot >= 0 || lastComma >= 0) {
    const mark = lastDot >= 0 ? "." : ",";
    const occurrences = cleaned.split(mark).length - 1;
    const digitsAfter = cleaned.length - cleaned.lastIndexOf(mark) - 1;
    decimalMark = occurrences === 1 && digitsAfter !== 3 ? mark : null;
  }

  let integer = cleaned;
  let fraction = "";
  if (decimalMark) {
    const at = cleaned.lastIndexOf(decimalMark);
    integer = cleaned.slice(0, at);
    fraction = cleaned.slice(at + 1);
  }
  // A decimal mark with nothing after it, or thousands groups that are not
  // groups of three ("1,2,3"), is a typo, not a price.
  if (decimalMark && fraction === "") return null;
  if (/[.,]/.test(integer) && !/^\d{1,3}([.,]\d{3})+$/.test(integer)) return null;
  integer = integer.replace(/[.,]/g, "");
  if (integer === "" || !/^\d{0,2}$/.test(fraction)) return null;
  const value = fraction ? `${integer}.${fraction}` : integer;
  return /^\d+(\.\d{1,2})?$/.test(value) ? value : null;
}
