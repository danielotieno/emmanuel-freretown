import { safeErrorFields } from "./errors";
import { isLoggerRecord } from "./logger";
import { scrubValue } from "./scrub";

const METHODS = ["log", "info", "debug", "warn", "error", "trace"] as const;
type ConsoleMethod = (typeof METHODS)[number];

const INSTALLED = Symbol.for("ack.consoleGuard");

type GuardedConsole = Console & { [INSTALLED]?: Partial<Record<ConsoleMethod, Console["log"]>> };

/**
 * Wraps the console so that nothing printed by Next.js, OpenNext, a library or our own code
 * reaches Workers Logs with personal data in it. Our logger already writes safe lines; this is
 * for the rest, chiefly Next.js printing an unhandled error, whose message may be a Drizzle
 * error carrying query parameters. Errors become their safe fields; strings and objects are
 * scrubbed. Installed once per isolate from src/instrumentation.ts.
 */
export function installConsoleGuard(target: Console = console): void {
  const guarded = target as GuardedConsole;
  if (guarded[INSTALLED]) return;
  const originals: Partial<Record<ConsoleMethod, Console["log"]>> = {};
  for (const method of METHODS) {
    const original = target[method].bind(target);
    originals[method] = original;
    target[method] = (...args: unknown[]) => original(...args.map(guardArgument));
  }
  guarded[INSTALLED] = originals;
}

/** Restores the original console methods. For tests. */
export function uninstallConsoleGuard(target: Console = console): void {
  const guarded = target as GuardedConsole;
  const originals = guarded[INSTALLED];
  if (!originals) return;
  for (const method of METHODS) {
    const original = originals[method];
    if (original) target[method] = original;
  }
  delete guarded[INSTALLED];
}

export function guardArgument(arg: unknown): unknown {
  // Our logger's lines are already safe, and scrubbing them again would remove SQLSTATEs.
  if (isLoggerRecord(arg)) return arg;
  if (arg instanceof Error) return safeErrorFields(arg);
  return scrubValue(arg);
}
