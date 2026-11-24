/**
 * Whether a cookie set for this request should carry the `Secure` attribute.
 *
 * Always true, except on a loopback host (`localhost`, `*.localhost`, `127.0.0.1`, `[::1]`),
 * where local builds and E2E tests run over plain http. Browsers differ there: Chromium accepts
 * `Secure` cookies on http://localhost, but WebKit on Linux drops them. A missing or unknown
 * host gets `Secure`, so a misconfiguration fails safe.
 */
export function isSecureCookieHost(host: string | null | undefined): boolean {
  if (!host) return true;
  const name = host.trim().toLowerCase().replace(/:\d+$/, "");
  const loopback =
    name === "localhost" || name.endsWith(".localhost") || name === "127.0.0.1" || name === "[::1]";
  return !loopback;
}
