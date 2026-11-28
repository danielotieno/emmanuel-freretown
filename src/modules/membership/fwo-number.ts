/**
 * Reads an FWO number however it was typed (BR-01, D61): digits only, with spaces around it
 * trimmed and leading zeros dropped, because they don't count: "054" and "54" are the same
 * number, stored as "54". A number of zeros only is "0". Anything else, spaces inside included,
 * is null. Every FWO number that reaches the database or a lookup goes through here, so the
 * unique index, the conflict flags, the status check and search all see one form.
 */
export function readFwoNumber(input: string): string | null {
  const value = input.trim();
  if (!/^[0-9]+$/.test(value)) return null;
  return value.replace(/^0+(?=[0-9])/, "");
}
