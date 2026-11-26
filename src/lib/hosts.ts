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

/** Hostnames that serve the staff portal. Exact matches only (ADR 0002 amendment). */
export const ADMIN_HOSTNAMES: ReadonlySet<string> = new Set([
  "admin.ackemmanuelfreretown.org",
  "admin-staging.ackemmanuelfreretown.org",
  "admin.localhost",
]);

/** The hostname from a Host header: lowercase, without the port. */
export function hostnameOf(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/:\d+$/, "");
}

/** Whether a Host header names the staff portal. */
export function isAdminHost(host: string | null | undefined): boolean {
  return ADMIN_HOSTNAMES.has(hostnameOf(host));
}

/**
 * The staff portal's origin for a request to `host`, or null when `host` isn't an admin host.
 * Https everywhere except loopback, where local builds run over plain http.
 */
export function adminOrigin(host: string | null | undefined): string | null {
  if (!isAdminHost(host)) return null;
  const value = (host ?? "").trim().toLowerCase();
  return `${isSecureCookieHost(value) ? "https" : "http"}://${value}`;
}

/** The public site that goes with each staff host. */
const PUBLIC_HOSTNAME_OF: Readonly<Record<string, string>> = {
  "admin.ackemmanuelfreretown.org": "ackemmanuelfreretown.org",
  "admin-staging.ackemmanuelfreretown.org": "staging.ackemmanuelfreretown.org",
  "admin.localhost": "localhost",
};

/**
 * The public site's origin for a request to the staff host `host` (keeping a local port), for
 * links from staff pages to public ones such as the privacy notice. Null on any other host.
 */
export function publicOrigin(host: string | null | undefined): string | null {
  const name = PUBLIC_HOSTNAME_OF[hostnameOf(host)];
  if (!name) return null;
  const port = /:(\d+)$/.exec((host ?? "").trim())?.[1];
  const value = port ? `${name}:${port}` : name;
  return `${isSecureCookieHost(value) ? "https" : "http"}://${value}`;
}
