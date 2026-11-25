/**
 * Registration references (FR-1): `REG-` and five characters from an alphabet without 0, O, 1
 * and I, so a reference read aloud or copied by hand isn't misread. 32^5 ≈ 33.5 million.
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 characters, so `& 31` is uniform

export const REFERENCE_PATTERN = /^REG-[2-9A-HJ-NP-Z]{5}$/;

export function generateReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return `REG-${[...bytes].map((b) => ALPHABET[b & 31]).join("")}`;
}
