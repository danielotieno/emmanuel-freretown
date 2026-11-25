import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import { smsProviderFromEnv, type JobQueue, type SmsProvider } from "@/modules/notifications";

/** The Worker's env (bindings, vars and secrets) for this request. */
export async function getEnv(): Promise<Record<string, unknown>> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as Record<string, unknown>;
}

/** A string var or secret from the env; empty if it isn't set. */
export function secret(env: Record<string, unknown>, name: string): string {
  const value = env[name];
  return typeof value === "string" ? value : "";
}

const text = secret;

/**
 * Automated-test mode (Playwright, issue #16): SMS go nowhere and every OTP code is
 * `TEST_OTP_CODE`, so a test can finish the journey without a phone. On only when all three
 * hold: `E2E_TEST_MODE=1`, no Mobile Sasa token, and the environment isn't staging or
 * production. Any one of those missing turns it off, so it can't reach real members.
 */
export function isTestMode(env: Record<string, unknown>): boolean {
  return (
    text(env, "E2E_TEST_MODE") === "1" &&
    !text(env, "MOBILESASA_API_TOKEN") &&
    !["staging", "production"].includes(text(env, "SENTRY_ENVIRONMENT"))
  );
}

export const TEST_OTP_CODE = "000000";

const testSink: SmsProvider = {
  send: async () => ({ outcome: "accepted", messageId: "test-mode" }),
  balance: async () => 0,
};

export function smsProvider(env: Record<string, unknown>): SmsProvider {
  return isTestMode(env) ? testSink : smsProviderFromEnv(env);
}

/** Cloudflare's always-pass test site key, for local runs and tests only. */
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

/** The public Turnstile site key: the `TURNSTILE_SITE_KEY` var, or the test key locally. */
export function turnstileSiteKey(env: Record<string, unknown>): string {
  const key = text(env, "TURNSTILE_SITE_KEY");
  if (key) return key;
  return ["staging", "production"].includes(text(env, "SENTRY_ENVIRONMENT"))
    ? ""
    : TURNSTILE_TEST_SITE_KEY;
}

/** The job queue, or one that does nothing where the binding is missing (`next start`). */
export function jobQueue(env: Record<string, unknown>): JobQueue {
  const queue = env.JOBS as JobQueue | undefined;
  return queue ?? { send: async () => undefined, sendBatch: async () => undefined };
}

/**
 * The visitor's IP: Cloudflare's `CF-Connecting-IP`, which Cloudflare sets on every request and
 * a client can't override. Locally (no Cloudflare) the first `X-Forwarded-For` entry, or a
 * placeholder.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
