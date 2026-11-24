import { postgresFields, SafeError } from "../modules/observability";

/** What went wrong, from the Postgres SQLSTATE. */
export type DatabaseErrorKind =
  | "unique_violation"
  | "foreign_key_violation"
  | "check_violation"
  | "not_null_violation"
  | "exclusion_violation"
  | "raise_exception"
  | "insufficient_privilege"
  | "serialization_failure"
  | "deadlock"
  | "unavailable"
  | "unknown";

const KIND_BY_SQLSTATE: Record<string, DatabaseErrorKind> = {
  "23505": "unique_violation",
  "23503": "foreign_key_violation",
  "23514": "check_violation",
  "23502": "not_null_violation",
  "23P01": "exclusion_violation",
  P0001: "raise_exception",
  "42501": "insufficient_privilege",
  "40001": "serialization_failure",
  "40P01": "deadlock",
  "57P01": "unavailable",
  "57P03": "unavailable",
};

/**
 * A database failure with everything personal removed. Drizzle's DrizzleQueryError carries the
 * query parameters in its message (names, phone numbers, FWO numbers), and Postgres puts the
 * conflicting value in `detail` (`Key (phone_e164)=(+2547…)`). This error keeps only the
 * SQLSTATE, the constraint and the table, and drops the original as its cause, so nothing
 * downstream (Next.js, Sentry, a logger) can print it.
 */
export class SafeDatabaseError extends SafeError {
  readonly kind: DatabaseErrorKind;
  readonly sqlState?: string;
  readonly constraint?: string;
  readonly table?: string;

  constructor(fields: {
    kind: DatabaseErrorKind;
    sqlState?: string;
    constraint?: string;
    table?: string;
  }) {
    const where = [fields.table, fields.constraint].filter(Boolean).join(".");
    super(fields.kind, `Database ${fields.kind}${where ? ` on ${where}` : ""}`);
    this.name = "SafeDatabaseError";
    this.kind = fields.kind;
    this.sqlState = fields.sqlState;
    this.constraint = fields.constraint;
    this.table = fields.table;
  }
}

const CONNECTION_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND"]);

/** Maps any error from Drizzle or pg to a SafeDatabaseError. Other errors pass through. */
export function toSafeDatabaseError(error: unknown): unknown {
  if (error instanceof SafeDatabaseError || !(error instanceof Error)) return error;
  const { sqlState, constraint, table } = postgresFields(error);
  if (sqlState) {
    const kind =
      KIND_BY_SQLSTATE[sqlState] ?? (sqlState.startsWith("08") ? "unavailable" : "unknown");
    return new SafeDatabaseError({ kind, sqlState, constraint, table });
  }
  if (isConnectionError(error)) return new SafeDatabaseError({ kind: "unavailable" });
  if (error.name === "DrizzleQueryError" || error.name === "DatabaseError") {
    return new SafeDatabaseError({ kind: "unknown" });
  }
  return error;
}

function isConnectionError(error: Error): boolean {
  let current: unknown = error;
  for (let i = 0; i < 5 && current instanceof Error; i++) {
    const code = (current as Error & { code?: unknown }).code;
    if (typeof code === "string" && CONNECTION_CODES.has(code)) return true;
    current = current.cause;
  }
  return false;
}

/**
 * Runs a database operation and rethrows any failure as a SafeDatabaseError. Module functions
 * wrap their queries and transactions in this, so a raw database error never leaves a module.
 */
export async function safeQuery<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toSafeDatabaseError(error);
  }
}

/** True when `error` is a unique violation, optionally on a named constraint. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return (
    error instanceof SafeDatabaseError &&
    error.kind === "unique_violation" &&
    (constraint === undefined || error.constraint === constraint)
  );
}
