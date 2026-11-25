/**
 * HMAC-SHA256 with the Web Crypto API, which both workerd and Node provide. No framework or
 * database imports: modules use it directly.
 */

const encoder = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function keyFor(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    keys.set(secret, key);
  }
  return key;
}

/** HMAC-SHA256 of `message` keyed with `secret`, as lowercase hex. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await keyFor(secret), encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two strings in time that depends only on their length, not their content. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
