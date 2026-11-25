/**
 * The Content-Security-Policy that src/middleware.ts sends with every page: nonce-based, so
 * pages render dynamically. Adding a third-party script or frame means adding its origin here.
 */

/** Cloudflare Turnstile's origin: its script and its challenge frame. */
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * The public pages that can send an SMS and so show Turnstile (rule 8, issue #13): the
 * registration form and the status check. No other page may load it.
 */
export function usesTurnstile(pathname: string): boolean {
  return pathname === "/registration" || pathname.startsWith("/registration/");
}

export function contentSecurityPolicy(nonce: string, turnstile = false): string {
  const dev = process.env.NODE_ENV === "development";
  // With 'strict-dynamic', browsers trust the nonce on Turnstile's <script> tag and ignore the
  // host; the host is there for browsers without CSP Level 3.
  const turnstileScript = turnstile ? ` ${TURNSTILE_ORIGIN}` : "";
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${turnstileScript}${dev ? " 'unsafe-eval'" : ""}`,
    // Next.js and React inject inline style attributes; styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    turnstile ? `frame-src ${TURNSTILE_ORIGIN}` : "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
  ];
  return directives.join("; ");
}
