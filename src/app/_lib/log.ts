import "server-only";
import { headers } from "next/headers";
import { cache } from "react";
import { createLogger, type Logger } from "@/modules/observability";

/**
 * The logger for this request, tagged with the request id from src/middleware.ts. Pass it to
 * module functions that log. Never log personal data (CLAUDE.md rule 2).
 */
export const getLogger = cache(async (): Promise<Logger> => {
  const requestId = (await headers()).get("x-request-id");
  return createLogger({ requestId });
});
