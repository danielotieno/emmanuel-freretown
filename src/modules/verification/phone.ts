import { PHONE_E164_REGEX } from "../../db/schema";

/**
 * Kenyan mobile numbers only (BR-06, FR-2: "Only Kenyan mobile numbers can receive codes").
 * The same rule as the database's CHECK on every phone column: +254 followed by 7 or 1 and
 * eight digits (Safaricom, Airtel, Telkom and Equitel numbers all fit it).
 */
export const KENYAN_MOBILE_E164 = PHONE_E164_REGEX;

/**
 * Turns what a person types into E.164 (`+2547…` or `+2541…`), or null if it isn't a Kenyan
 * mobile number. Accepts 07…/01…, 7…/1…, 2547…/2541… and +254…, with spaces, dashes, dots
 * or brackets between digits. Anything else, including other countries' numbers, is null:
 * callers refuse it before spending a rate-limit slot, a Turnstile check or an SMS.
 */
export function normalizeKenyanPhone(input: string): string | null {
  const compact = input.trim().replace(/[\s\-.()]/g, "");
  let national: string | undefined;
  if (/^\+254\d{9}$/.test(compact)) national = compact.slice(4);
  else if (/^254\d{9}$/.test(compact)) national = compact.slice(3);
  else if (/^0\d{9}$/.test(compact)) national = compact.slice(1);
  else if (/^\d{9}$/.test(compact)) national = compact;
  if (national === undefined) return null;
  const e164 = `+254${national}`;
  return KENYAN_MOBILE_E164.test(e164) ? e164 : null;
}
