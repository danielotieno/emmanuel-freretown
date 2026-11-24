import { DrizzleQueryError } from "drizzle-orm/errors";
import { postgresFields, SafeError } from "../modules/observability";

/**
 * A database failure with everything personal removed. Drizzle's DrizzleQueryError carries the
 * query parameters in its message (names, phone numbers, FWO numbers), and Postgres puts the
 * conflicting value in `detail` (`Key (phone_e164)=(+2547…)`). This error keeps only the
 * SQLSTATE, constraint and table, and drops the original as its cause, so nothing downstream
 * (Next.js, Sentry, a logger) can print it.
 */
export class SafeDatabaseError extends SafeError {
  readonly sqlState?: string;
  readonly constraint?: string;
  readonly table?: string;

  constructor(fields: { sqlState?: string; constraint?: string; table?: string }) {
    const where = [fields.table, fields.constraint].filter(Boolean).join(".");
    // The SQLSTATE goes in its own field, not the message: messages are scrubbed of digit runs.
    super("database_error", `Database error${where ? ` on ${where}` : ""}`);
    this.name = "SafeDatabaseError";
    this.sqlState = fields.sqlState;
    this.constraint = fields.constraint;
    this.table = fields.table;
  }
}

/**
 * Maps an error from Drizzle or pg to a SafeDatabaseError. Any DrizzleQueryError is mapped,
 * including one without a SQLSTATE (a dropped connection or timeout), because its message
 * always carries the parameters. Other errors pass through unchanged.
 */
export function toSafeDatabaseError(error: unknown): unknown {
  if (error instanceof SafeDatabaseError) return error;
  const fields = postgresFields(error);
  if (error instanceof DrizzleQueryError || fields.sqlState) return new SafeDatabaseError(fields);
  return error;
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

/** True when `error` is a unique violation (23505), optionally on a named constraint. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  return (
    error instanceof SafeDatabaseError &&
    error.sqlState === "23505" &&
    (constraint === undefined || error.constraint === constraint)
  );
}
