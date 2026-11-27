/**
 * A random string of `length` characters from `alphabet`, from the platform's CSPRNG (Workers
 * and Node alike). Rejection sampling keeps every character equally likely.
 */
export function randomString(length: number, alphabet: string): string {
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (byte < limit && out.length < length) out += alphabet[byte % alphabet.length];
    }
  }
  return out;
}
