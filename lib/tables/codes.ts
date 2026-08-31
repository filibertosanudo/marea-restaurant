/**
 * Pure so batch-create's numbering can be reasoned about (and tested)
 * without a database — given the codes that already exist under a prefix,
 * pick up numbering where it left off instead of guessing a starting
 * number the caller has to hope doesn't collide.
 */
export function nextTableCodes(existingCodes: string[], prefix: string, quantity: number): string[] {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedPrefix}(\\d+)$`);

  let maxNumber = 0;
  let padWidth = 2;
  for (const code of existingCodes) {
    const match = pattern.exec(code);
    if (!match) continue;
    const digits = match[1];
    const value = Number(digits);
    if (value > maxNumber) maxNumber = value;
    if (digits.length > padWidth) padWidth = digits.length;
  }

  const codes: string[] = [];
  for (let i = 1; i <= quantity; i++) {
    codes.push(`${prefix}${String(maxNumber + i).padStart(padWidth, "0")}`);
  }
  return codes;
}
