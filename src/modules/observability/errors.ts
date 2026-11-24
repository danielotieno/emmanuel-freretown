import { scrubStackFrame, scrubText } from "./scrub";

/**
 * An error whose message was written by us and never contains personal data. Its message may
 * be logged and reported. Every other error is reduced to its name, codes and stack frames.
 */
export class SafeError extends Error {
  /** A stable, machine-readable code, e.g. "database_error". */
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SafeError";
    this.code = code;
  }
}

function isSafeError(error: unknown): error is SafeError {
  return error instanceof SafeError;
}

export interface SafeErrorFields {
  errorName: string;
  errorCode?: string;
  errorMessage?: string;
  /** Postgres SQLSTATE, e.g. 23505. */
  sqlState?: string;
  /** Constraint and table names are schema identifiers, never data. */
  constraint?: string;
  table?: string;
  /** Next.js's error digest: the id shown on the error page. */
  digest?: string;
  /** Stack frames only; the first line of a stack repeats the message. */
  stack?: string;
}

/** Five characters with at least one digit, so Node codes like EPIPE don't pass. */
const SQLSTATE = /^(?=.*\d)[0-9A-Z]{5}$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const DIGEST = /^\d{1,20}$/;
const MAX_CAUSES = 5;
const MAX_FRAMES = 15;

/**
 * The parts of an error that are safe to log or report. Only a SafeError's message is kept.
 * Every other message is dropped, including the JavaScript engine's own: they echo input
 * (`JSON.parse` quotes the text it failed on). `detail`, `params`, `query` and `cause` are
 * never read out.
 */
export function safeErrorFields(error: unknown): SafeErrorFields {
  if (!(error instanceof Error)) {
    return { errorName: typeof error === "object" && error !== null ? "NonError" : typeof error };
  }

  const fields: SafeErrorFields = { errorName: safeName(error) };
  if (isSafeError(error)) {
    fields.errorCode = error.code;
    fields.errorMessage = scrubText(error.message);
  }

  const pg = postgresFields(error);
  if (pg.sqlState) fields.sqlState = pg.sqlState;
  if (pg.constraint) fields.constraint = pg.constraint;
  if (pg.table) fields.table = pg.table;

  const digest = (error as Error & { digest?: unknown }).digest;
  if (typeof digest === "string" && DIGEST.test(digest)) fields.digest = digest;

  const stack = stackFrames(error.stack);
  if (stack) fields.stack = stack;
  return fields;
}

function safeName(error: Error): string {
  return IDENTIFIER.test(error.name) ? error.name : "Error";
}

/**
 * Finds the Postgres fields in an error chain: a pg error (`code`), one wrapped by Drizzle's
 * DrizzleQueryError (`cause`), or our own SafeDatabaseError (`sqlState`).
 */
export function postgresFields(error: unknown): {
  sqlState?: string;
  constraint?: string;
  table?: string;
} {
  let current: unknown = error;
  for (let i = 0; i <= MAX_CAUSES && current instanceof Error; i++) {
    const candidate = current as Error & {
      sqlState?: unknown;
      code?: unknown;
      constraint?: unknown;
      table?: unknown;
    };
    const sqlState = candidate.sqlState ?? candidate.code;
    if (typeof sqlState === "string" && SQLSTATE.test(sqlState)) {
      return {
        sqlState,
        constraint: identifier(candidate.constraint),
        table: identifier(candidate.table),
      };
    }
    current = candidate.cause;
  }
  return {};
}

function identifier(value: unknown): string | undefined {
  return typeof value === "string" && IDENTIFIER.test(value) ? value : undefined;
}

function stackFrames(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const frames = stack
    .split("\n")
    .filter((line) => /^\s+at\s/.test(line))
    .slice(0, MAX_FRAMES)
    .map((line) => scrubStackFrame(line.trim()));
  return frames.length > 0 ? frames.join("\n") : undefined;
}
