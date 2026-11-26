/**
 * The Content-Security-Policy that src/middleware.ts sends with every page: nonce-based, so
 * pages render dynamically. Adding a third-party script or frame means adding its origin here.
 */

/** Cloudflare Turnstile's origin: its script and its challenge frame. */
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * The pages that can send an SMS and so show Turnstile (rule 8, issue #13): on the public site,
 * the registration form and the status check; on the staff host, the officer desk at `/desk`
 * (#18). No other page may load it. `pathname` is the path the browser asked for, before the
 * middleware moves staff pages under /admin.
 *
 * The policy that applies is the one the document was loaded with. After a client-side
 * navigation (a Next.js `<Link>`) from another page, the browser keeps that page's
 * `frame-src 'none'` and blocks Turnstile, so the visitor can't send a code. Every link into
 * `/registration` or `/desk` must therefore be a plain `<a>` (a full page load), never `<Link>`.
 */
export function usesTurnstile(pathname: string, adminHost = false): boolean {
  const root = adminHost ? "/desk" : "/registration";
  return pathname === root || pathname.startsWith(`${root}/`);
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
