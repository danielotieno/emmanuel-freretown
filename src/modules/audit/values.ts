import { SafeError } from "../observability";

/** A JSON value as stored in `before` and `after`. Dates go in as ISO strings. */
export type AuditValue =
  string | number | boolean | null | AuditValue[] | { [key: string]: AuditValue };

/** The `before` or `after` of an audit entry: the fields that changed, and nothing else. */
export type AuditValues = { [key: string]: AuditValue };

/**
 * Keys that name a secret. An audit entry may hold personal values (BR-12 asks for before and
 * after values, and retention redaction removes them from registration entries, BR-14), but
 * never a secret: an OTP code or its hash, a password, a token, a session cookie or a key.
 * Fragments match anywhere in the key, flattened (`otp_code`, `otpcode` → `otpcode`), so
 * one-word spellings are caught too; a few words match whole, because as fragments they occur
 * inside ordinary words ("shipping", "monkey"). This is a safety net, not a guarantee: callers
 * choose what goes into an entry, and must never pass a secret under any name.
 */
const SECRET_FRAGMENTS = [
  "otp",
  "code",
  "hash",
  "password",
  "secret",
  "token",
  "cookie",
  "apikey",
  "authorization",
];
const SECRET_WORDS = new Set(["pin", "pins", "salt", "key", "keys"]);

export function isSecretKey(key: string): boolean {
  const flat = key.toLowerCase().replace(/[_-]/g, "");
  if (SECRET_FRAGMENTS.some((fragment) => flat.includes(fragment))) return true;
  return key
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2") // PINCount → PIN Count
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // signingKey → signing Key
    .toLowerCase()
    .split(/[\s_-]+/)
    .some((word) => SECRET_WORDS.has(word));
}

/**
 * Throws if `values` holds a secret under any key, at any depth. The error names the key (a
 * schema identifier we wrote), never the value. This is a programming error: fix the caller.
 */
export function assertNoSecrets(values: AuditValue | undefined, path = ""): void {
  if (values === null || typeof values !== "object") return;
  if (Array.isArray(values)) {
    values.forEach((item, i) => assertNoSecrets(item, `${path}[${i}]`));
    return;
  }
  for (const [key, value] of Object.entries(values)) {
    const at = path ? `${path}.${key}` : key;
    if (isSecretKey(key)) {
      throw new SafeError("audit_secret_value", `Audit values must not hold a secret (${at})`);
    }
    assertNoSecrets(value, at);
  }
}

/**
 * Keeps only the fields that differ between two snapshots of a record, so an entry holds what
 * is needed and no more. A field missing on one side is recorded as null on that side. Nested
 * objects are compared regardless of key order (jsonb read back from Postgres reorders keys).
 *
 *   await audit.write(tx, { actor, action: "member.edit", entityType: "member", entityId,
 *                           ...audit.changes(old, updated) });
 */
export function changes(
  before: AuditValues,
  after: AuditValues,
): { before: AuditValues; after: AuditValues } {
  const result = { before: {} as AuditValues, after: {} as AuditValues };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[key] ?? null;
    const now = after[key] ?? null;
    if (canonical(was) !== canonical(now)) {
      result.before[key] = was;
      result.after[key] = now;
    }
  }
  return result;
}

/** JSON text with object keys sorted at every depth; array order still counts. */
function canonical(value: AuditValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k]!)}`).join(",")}}`;
}
