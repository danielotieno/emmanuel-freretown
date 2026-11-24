/**
 * observability: structured logging, safe errors and Sentry, with personal data kept out
 * (CLAUDE.md rule 2, NFR-9, ADR 0002). See docs/operations/observability.md.
 * Public API of this module. Other code imports only from here.
 */
export {
  createLogger,
  type Logger,
  type LogFields,
  type LogLevel,
  type LogRecord,
  type LogSink,
  type LogValue,
} from "./logger";
export {
  isSafeError,
  postgresFields,
  SafeError,
  safeErrorFields,
  type SafeErrorFields,
} from "./errors";
export { REDACTED, scrubText, scrubValue } from "./scrub";
export { guardArgument, installConsoleGuard, uninstallConsoleGuard } from "./console-guard";
export {
  errorTags,
  registerErrorReporter,
  reportError,
  scrubEvent,
  sentryOptions,
  type ErrorReporter,
  type SentryEnv,
} from "./sentry";
