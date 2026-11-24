import { safeErrorFields } from "./errors";
import { isLoggerRecord } from "./logger";
import { scrubValue } from "./scrub";

const METHODS = ["log", "info", "debug", "warn", "error", "trace"] as const;
const INSTALLED = Symbol.for("ack.consoleGuard");

/**
 * Wraps the console so that nothing printed by Next.js, OpenNext, a library or our own code
 * reaches Workers Logs with personal data in it. Our logger already writes safe lines; this is
 * for the rest, chiefly Next.js printing an unhandled error, whose message may be a Drizzle
 * error carrying query parameters. Errors become their safe fields; strings and objects are
 * scrubbed. Installed once per isolate from src/instrumentation.ts, in production builds.
 *
 * It can't catch what the runtime records itself: workerd logs uncaught exceptions with their
 * message. The real control is not letting raw errors escape (safeQuery in src/db).
 */
export function installConsoleGuard(target: Console = console): void {
  const guarded = target as Console & { [INSTALLED]?: true };
  if (guarded[INSTALLED]) return;
  for (const method of METHODS) {
    const original = target[method].bind(target);
    target[method] = (...args: unknown[]) => original(...args.map(guardArgument));
  }
  guarded[INSTALLED] = true;
}

function guardArgument(arg: unknown): unknown {
  // Our logger's lines are already safe, and scrubbing them again would remove SQLSTATEs.
  if (isLoggerRecord(arg)) return arg;
  if (arg instanceof Error) return safeErrorFields(arg);
  return scrubValue(arg);
}
