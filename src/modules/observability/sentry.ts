// Types only. The SDK imports `cloudflare:workers`, so it can't load in Node (next dev, Vitest,
// Playwright): only worker.ts imports it at runtime, and registers a reporter (below).
import type { CloudflareOptions, ErrorEvent, EventHint, Exception } from "@sentry/cloudflare";
import { isSafeError, safeErrorFields } from "./errors";
import { REDACTED, scrubText, scrubValue } from "./scrub";

/** The Worker's variables and secrets that Sentry reads. */
export interface SentryEnv {
  /** Secret. Empty or unset: Sentry sends nothing (local development). */
  SENTRY_DSN?: string;
  /** "staging" or "production", from wrangler.jsonc. */
  SENTRY_ENVIRONMENT?: string;
}

/**
 * Integrations we never load: RequestData attaches headers, cookies, query strings, bodies and
 * the client IP; Console turns every console line into a breadcrumb.
 */
const EXCLUDED_INTEGRATIONS = new Set(["RequestData", "Console"]);

/**
 * Sentry options for withSentry in worker.ts (ADR 0002: "Sentry (Cloudflare SDK) with personal
 * data stripped"). Error events only: no tracing, no breadcrumbs, no request data, no user.
 * beforeSend scrubs what is left. Returns undefined when no DSN is set, so nothing is sent.
 */
export function sentryOptions(env: SentryEnv): CloudflareOptions | undefined {
  if (!env.SENTRY_DSN) return undefined;
  return {
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? "local",
    // Sentry 11 collects most of this by default. Turn every part off; beforeSend still scrubs.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    integrations: (defaults) =>
      defaults.filter((integration) => !EXCLUDED_INTEGRATIONS.has(integration.name)),
    beforeSend: scrubEvent,
  };
}

export type ErrorReporter = (error: unknown, tags: Record<string, string>) => void;

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
 * Exception types whose message we keep, after scrubbing (see errors.ts). Matched by name, so
 * library errors are never here: pg's error class is also called DatabaseError.
 */
const ENGINE_ERRORS = new Set([
  "TypeError",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "URIError",
  "EvalError",
]);

/**
 * Removes personal data from a Sentry event before it leaves the Worker: request data other
 * than method and path, user, extra data, breadcrumbs, and exception messages except those of
 * our own safe errors and engine errors. Exported for tests.
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
  delete event.breadcrumbs;
  delete event.server_name;
  if (event.message) event.message = scrubText(event.message);
  if (event.logentry) {
    event.logentry = { message: event.logentry.message ? scrubText(event.logentry.message) : "" };
  }
  if (event.contexts) event.contexts = scrubValue(event.contexts) as ErrorEvent["contexts"];
  if (event.tags) event.tags = scrubValue(event.tags) as ErrorEvent["tags"];
  // Sentry lists linked causes first and the captured error last.
  const values = event.exception?.values ?? [];
  const capturedIsSafe = isSafeError(hint?.originalException);
  values.forEach((exception, i) =>
    scrubException(exception, capturedIsSafe && i === values.length - 1),
  );
  return event;
}

function scrubException(exception: Exception, safe: boolean): void {
  const keep = safe || ENGINE_ERRORS.has(exception.type ?? "");
  exception.value = exception.value && keep ? scrubText(exception.value) : REDACTED;
  for (const frame of exception.stacktrace?.frames ?? []) delete frame.vars;
  if (exception.mechanism?.data) delete exception.mechanism.data;
}

function pathOnly(url: string): string {
  try {
    const { origin, pathname } = new URL(url);
    return `${origin}${pathname}`;
  } catch {
    return REDACTED;
  }
}

/** Safe fields for a Sentry tag set, for callers that also log. */
export function errorTags(error: unknown): Record<string, string> {
  const { errorName, errorCode, sqlState, constraint } = safeErrorFields(error);
  const tags: Record<string, string> = { errorName };
  if (errorCode) tags.errorCode = errorCode;
  if (sqlState) tags.sqlState = sqlState;
  if (constraint) tags.constraint = constraint;
  return tags;
}
