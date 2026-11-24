import type { Instrumentation } from "next";
import { createLogger, errorTags, installConsoleGuard, reportError } from "@/modules/observability";

/** Runs once per server instance, before any request (Node, Edge and the Worker). */
export function register() {
  installConsoleGuard();
}

/**
 * Next.js calls this for every error a route, action or page throws. The error is logged with
 * its safe fields only and reported to Sentry, which scrubs it again. Next.js also prints the
 * error itself; the console guard installed in register() strips that line.
 */
export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  const requestId = header(request.headers, "x-request-id");
  const log = createLogger({ requestId });
  log.error("request.failed", error, {
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
  });
  reportError(error, {
    ...errorTags(error),
    routePath: context.routePath,
    ...(requestId ? { requestId } : {}),
  });
};

function header(headers: Record<string, string | string[] | undefined>, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}
