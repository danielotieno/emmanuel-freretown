/**
 * observability: structured logging, safe errors and Sentry, with personal data kept out
 * (CLAUDE.md rule 2, NFR-9, ADR 0002). See docs/operations/observability.md.
 * Public API of this module. Other code imports only from here.
 */
export { createLogger, type Logger, type LogFields, type LogRecord } from "./logger";
export { postgresFields, SafeError, safeErrorFields } from "./errors";
export { installConsoleGuard } from "./console-guard";
export {
  errorTags,
  registerErrorReporter,
  reportError,
  scrubEvent,
  sentryOptions,
  type SentryEnv,
} from "./sentry";
