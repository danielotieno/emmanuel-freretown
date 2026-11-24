/**
 * Last-line scrubbing of personal data from free text and loose objects (CLAUDE.md rule 2,
 * NFR-9). The first line of defence is never passing personal data to a log or error report at
 * all; this catches what slips through. Names cannot be recognised in free text, which is why
 * error messages are dropped rather than scrubbed (see errors.ts).
 */

export const REDACTED = "[redacted]";

/** Keys whose values are never written, at any depth. Compared after lowercasing and removing `_` and `-`. */
const DENIED_KEYS = new Set([
  "name",
  "fullname",
  "firstname",
  "lastname",
  "code",
  "message",
  "detail",
  "params",
  "parameters",
  "cause",
  "query",
  "body",
  "data",
  "headers",
  "authorization",
]);

/** Key fragments that mark a value as personal or secret, wherever they appear in the key. */
const DENIED_KEY_FRAGMENTS = [
  "phone",
  "msisdn",
  "mobile",
  "fwo",
  "otp",
  "email",
  "password",
  "secret",
  "token",
  "cookie",
  "apikey",
];

export function isDeniedKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[_-]/g, "");
  return DENIED_KEYS.has(k) || DENIED_KEY_FRAGMENTS.some((fragment) => k.includes(fragment));
}

const TEXT_PATTERNS: RegExp[] = [
  // Drizzle's DrizzleQueryError: "Failed query: ...\nparams: <values>". Everything after
  // "params:" is personal data.
  /params:[\s\S]*/gi,
  // Postgres constraint details: Key (phone_e164)=(+254712345678) already exists.
  /=\([^)]*\)/g,
  // Phone numbers: +254…, 254…, 07…/01… with optional separators, and any other E.164 number.
  /\+?\b254[\s-]?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g,
  /\b0[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g,
  /\+\d{8,15}\b/g,
  // Email addresses.
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  // Standalone digit runs (FWO numbers, OTP codes). Runs joined to letters or hyphens, such as
  // dates, UUIDs and ray ids, are left alone.
  /(?<![\w-])\d{4,}(?![\w-])/g,
];

/** Replaces phone numbers, emails, digit runs and SQL parameters in free text. */
export function scrubText(text: string): string {
  return TEXT_PATTERNS.reduce((out, pattern) => out.replace(pattern, REDACTED), text);
}

/** The digit-run rule would remove line and column numbers, so stack frames skip it. */
const STACK_PATTERNS = TEXT_PATTERNS.slice(0, -1);

/** Scrubs one stack frame line: phone numbers, emails and SQL parameters, not line numbers. */
export function scrubStackFrame(line: string): string {
  return STACK_PATTERNS.reduce((out, pattern) => out.replace(pattern, REDACTED), line);
}

const MAX_DEPTH = 6;

/**
 * Returns a copy of `value` with denied keys redacted and strings scrubbed. Errors are reduced
 * to their safe fields by the caller before they get here; any that remain lose their message.
 */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return REDACTED;
  if (value instanceof Error) return { errorName: value.name };
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = isDeniedKey(key) ? REDACTED : scrubValue(item, depth + 1);
  }
  return out;
}
