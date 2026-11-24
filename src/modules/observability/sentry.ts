// Types only. The SDK imports `cloudflare:workers`, so it can't load in Node (next dev, Vitest,
// Playwright): only worker.ts imports it at runtime, and registers a reporter (below).
import type { CloudflareOptions, ErrorEvent, EventHint } from "@sentry/cloudflare";
import { isSafeError, safeErrorFields } from "./errors";
import { REDACTED, scrubText } from "./scrub";

/** The Worker's variables and secrets that Sentry reads. */
export interface SentryEnv {
  /** Secret. Empty or unset: Sentry sends nothing (local development, CI). */
  SENTRY_DSN?: string;
  /** "staging" or "production", from wrangler.jsonc. The SDK reads it itself. */
  SENTRY_ENVIRONMENT?: string;
}

/**
 * Integrations we never load: RequestData attaches request details, and Console wraps the
 * console to make breadcrumbs.
 */
const EXCLUDED_INTEGRATIONS = new Set(["RequestData", "Console"]);

/**
 * Sentry options for withSentry in worker.ts (ADR 0002: "Sentry (Cloudflare SDK) with personal
 * data stripped"). Error events only. Returns undefined when no DSN is set, so nothing is sent.
 *
 * No `tracesSampleRate`, not even 0, and never the SENTRY_TRACES_SAMPLE_RATE variable: Sentry
 * counts 0 as "tracing on", and then a request carrying a sampled `sentry-trace` header sends
 * spans that bypass beforeSend (beforeSendTransaction is ignored in Sentry 11's default
 * streaming mode, so it can't be a fallback).
 */
export function sentryOptions(env: SentryEnv): CloudflareOptions | undefined {
  if (!env.SENTRY_DSN) return undefined;
  return {
    dsn: env.SENTRY_DSN,
    // Sentry 11 collects all of this by default.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    maxBreadcrumbs: 0,
    integrations: (defaults) =>
      defaults.filter((integration) => !EXCLUDED_INTEGRATIONS.has(integration.name)),
    beforeSend: scrubEvent,
  };
}

type ErrorReporter = (error: unknown, tags: Record<string, string>) => void;

const REPORTER = Symbol.for("ack.errorReporter");
type WithReporter = typeof globalThis & { [REPORTER]?: ErrorReporter };

/** Called once by worker.ts with Sentry's captureException. */
export function registerErrorReporter(reporter: ErrorReporter | undefined): void {
  (globalThis as WithReporter)[REPORTER] = reporter;
}

/**
 * Reports an error to Sentry when running in the Worker with a DSN set; otherwise does nothing.
 * Sentry applies scrubEvent before sending. Tags must not contain personal data.
 */
export function reportError(error: unknown, tags: Record<string, string> = {}): void {
  (globalThis as WithReporter)[REPORTER]?.(error, tags);
}

/**
 * Removes personal data from a Sentry event before it leaves the Worker: request data other
 * than method and path, the user, extra data, and every exception message except that of the
 * captured error when it is one of our SafeErrors. Tags and contexts are left alone: tags come
 * only from errorTags and route patterns, contexts from the runtime. Exported for tests.
 */
export function scrubEvent(event: ErrorEvent, hint?: EventHint): ErrorEvent {
  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url ? pathOnly(event.request.url) : undefined,
    };
  }
  delete event.user;
  delete event.extra;
  delete event.server_name;
  // Sentry lists linked causes first and the captured error last.
  const values = event.exception?.values ?? [];
  const capturedIsSafe = isSafeError(hint?.originalException);
  values.forEach((exception, i) => {
    const keep = capturedIsSafe && i === values.length - 1;
    exception.value = exception.value && keep ? scrubText(exception.value) : REDACTED;
    for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars;
  });
  return event;
}

function pathOnly(url: string): string {
  try {
    const { origin, pathname } = new URL(url);
    return `${origin}${pathname}`;
  } catch {
    return REDACTED;
  }
}

/** Safe fields of an error as Sentry tags. */
export function errorTags(error: unknown): Record<string, string> {
  const { errorName, errorCode, sqlState, constraint, digest } = safeErrorFields(error);
  const tags: Record<string, string> = { errorName };
  if (errorCode) tags.errorCode = errorCode;
  if (sqlState) tags.sqlState = sqlState;
  if (constraint) tags.constraint = constraint;
  if (digest) tags.digest = digest;
  return tags;
}
