import { safeErrorFields } from "./errors";
import { isDeniedKey, REDACTED, scrubText } from "./scrub";

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Values a log field may hold. Objects are not accepted: log the few fields you need. */
export type LogValue = string | number | boolean | null | undefined;

export interface LogFields {
  [key: string]: LogValue;
}

/** One structured log line. Workers Logs indexes each field. */
export interface LogRecord {
  level: LogLevel;
  event: string;
  requestId?: string;
  [key: string]: unknown;
}

export type LogSink = (record: LogRecord) => void;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
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
  sink?: LogSink;
  /** Lines below this level are dropped. Defaults to "info". */
  minLevel?: LogLevel;
}

/** Records built here are already safe; the console guard passes them through unchanged. */
const LOGGER_RECORDS = new WeakSet<object>();

export function isLoggerRecord(value: unknown): boolean {
  return typeof value === "object" && value !== null && LOGGER_RECORDS.has(value);
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** `event` names what happened, in dotted lower case: "registration.submitted". */
const EVENT_NAME = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/;

/**
 * The only logging path for application code (CLAUDE.md rule 2, NFR-9). Lines are JSON
 * objects with a request id. Fields named like personal data are replaced with "[redacted]"
 * and string values are scrubbed, but the rule is still: never pass names, phone numbers, FWO
 * numbers or OTP codes to a logger. Log ids, counts and outcomes instead.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const sink = options.sink ?? consoleSink;
  const minLevel = LEVELS[options.minLevel ?? "info"];
  const base: LogFields = options.requestId ? { requestId: options.requestId } : {};
  return build(base, sink, minLevel);
}

function build(base: LogFields, sink: LogSink, minLevel: number): Logger {
  const write = (level: LogLevel, event: string, fields?: LogFields, error?: unknown) => {
    if (LEVELS[level] < minLevel) return;
    const record: LogRecord = {
      level,
      event: EVENT_NAME.test(event) ? event : "invalid_event_name",
      ...safeFields(base),
      ...safeFields(fields),
    };
    if (error !== undefined) Object.assign(record, safeErrorFields(error));
    LOGGER_RECORDS.add(record);
    sink(record);
  };

  return {
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, error, fields) => write("error", event, fields, error),
    child: (fields) => build({ ...base, ...fields }, sink, minLevel),
  };
}

function safeFields(fields: LogFields | undefined): Record<string, LogValue> {
  const out: Record<string, LogValue> = {};
  if (!fields) return out;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (isDeniedKey(key)) out[key] = REDACTED;
    else if (typeof value === "string") out[key] = scrubText(value);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      out[key] = value;
    } else {
      // Not a LogValue: TypeScript rejects this, but JavaScript callers can still pass one.
      out[key] = REDACTED;
    }
  }
  return out;
}

/* eslint-disable no-console -- the one place application logs reach the console */
const consoleSink: LogSink = (record) => {
  if (record.level === "error") console.error(record);
  else if (record.level === "warn") console.warn(record);
  else console.log(record);
};
/* eslint-enable no-console */
