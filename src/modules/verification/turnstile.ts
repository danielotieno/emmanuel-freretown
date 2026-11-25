/** Cloudflare's server-side check of a Turnstile token. */
export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileOptions {
  secret: string;
  /** The visitor's IP (CF-Connecting-IP), passed on to Cloudflare. */
  ip?: string;
  /** For tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

/**
 * Verifies a Turnstile token server-side (rule 8, FR-1, FR-7). Fails closed: a missing or
 * oversized token, a network error, a timeout or any answer other than success is `false`.
 * Each token can be verified once; Cloudflare refuses a replay.
 */
export async function verifyTurnstile(token: string, options: TurnstileOptions): Promise<boolean> {
  // Cloudflare documents tokens of at most 2048 characters.
  if (!token || token.length > 2048 || !options.secret) return false;
  const body = new URLSearchParams({ secret: options.secret, response: token });
  if (options.ip) body.set("remoteip", options.ip);
  try {
    const response = await (options.fetch ?? fetch)(TURNSTILE_VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: unknown };
    return result.success === true;
  } catch {
    return false;
  }
}
