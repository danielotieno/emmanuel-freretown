import { safeErrorFields } from "./errors";
import { isDeniedKey, REDACTED, scrubText } from "./scrub";

/** Values a log field may hold. Objects are not accepted: log the few fields you need. */
export type LogValue = string | number | boolean | null | undefined;

export interface LogFields {
  [key: string]: LogValue;
}

/** One structured log line. Workers Logs indexes each field. */
export interface LogRecord {
  level: "info" | "warn" | "error";
  event: string;
  requestId?: string;
  [key: string]: unknown;
}

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  /** `error` is reduced to its safe fields (see safeErrorFields); its message is not logged. */
  error(event: string, error?: unknown, fields?: LogFields): void;
  /** A logger that adds `fields` to every line, e.g. `{ module: "registration" }`. */
  child(fields: LogFields): Logger;
}

export interface LoggerOptions {
  /** The request id from the `x-request-id` header set by src/middleware.ts. */
  requestId?: string | null;
  /** Where lines go. Defaults to the console, which Workers Logs collects. */
  sink?: (record: LogRecord) => void;
}

/**
 * Marks records built here, which are already safe, so the console guard passes them through
 * unchanged. A global symbol rather than a module-local set: worker.ts, the middleware and the
 * Next.js server each bundle their own copy of this module.
 */
const LOGGER_RECORD = Symbol.for("ack.loggerRecord");

export function isLoggerRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && LOGGER_RECORD in value;
}

/** `event` names what happened, in dotted lower case: "registration.submitted". */
const EVENT_NAME = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

/**
 * The only logging path for application code (CLAUDE.md rule 2, NFR-9). Lines are JSON
 * objects with a request id. Fields named like personal data are replaced with "[redacted]"
 * and string values are scrubbed, but the rule is still: never pass names, phone numbers, FWO
 * numbers or OTP codes to a logger. Log ids, counts and outcomes instead.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const base: LogFields = options.requestId ? { requestId: options.requestId } : {};
  return build(base, options.sink ?? consoleSink);
}

function build(base: LogFields, sink: (record: LogRecord) => void): Logger {
  const write = (level: LogRecord["level"], event: string, fields?: LogFields, error?: unknown) => {
    const record: LogRecord = {
      level,
      event: EVENT_NAME.test(event) ? event : "invalid_event_name",
      ...safeFields(base),
      ...safeFields(fields),
    };
    if (error !== undefined) Object.assign(record, safeErrorFields(error));
    Object.defineProperty(record, LOGGER_RECORD, { value: true });
    sink(record);
  };

  return {
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, error, fields) => write("error", event, fields, error),
    child: (fields) => build({ ...base, ...fields }, sink),
  };
}

function safeFields(fields: LogFields | undefined): Record<string, LogValue> {
  const out: Record<string, LogValue> = {};
  if (!fields) return out;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    // A flag can't carry personal data, so `phoneVerified: true` is kept.
    if (typeof value === "boolean" || value === null) out[key] = value;
    else if (isDeniedKey(key)) out[key] = REDACTED;
    else if (typeof value === "string") out[key] = scrubText(value);
    else if (typeof value === "number") out[key] = value;
    // Not a LogValue: TypeScript rejects this, but JavaScript callers can still pass one.
    else out[key] = REDACTED;
  }
  return out;
}

/* eslint-disable no-console -- the one place application logs reach the console */
function consoleSink(record: LogRecord) {
  if (record.level === "error") console.error(record);
  else if (record.level === "warn") console.warn(record);
  else console.log(record);
}
/* eslint-enable no-console */
