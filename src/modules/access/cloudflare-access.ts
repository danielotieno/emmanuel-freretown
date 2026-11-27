/**
 * Cloudflare Access in front of the staff hosts (docs/operations/environments.md §5). Access
 * adds a signed JWT to every request it lets through, in `Cf-Access-Jwt-Assertion`. Checking it
 * here means a request that reached the Worker without passing Access (a misconfigured
 * application, a route added later) is still refused. Access is a gate, not the security
 * boundary: the staff session and roles are checked as well (CLAUDE.md rule 1).
 */

export const ACCESS_JWT_HEADER = "cf-access-jwt-assertion";

/**
 * How to treat the Access JWT in this environment.
 * - `verify`: check it against the team's keys and the application's audience tag.
 * - `refuse`: staging or production without the settings to verify it. Fail closed.
 * - `skip`: local development and tests, where there is no Access in front.
 */
export type AccessJwtPolicy =
  | { mode: "verify"; teamDomain: string; audience: string; fetch?: typeof globalThis.fetch }
  | { mode: "refuse" }
  | { mode: "skip" };

const TEAM_DOMAIN = /^[a-z0-9-]+\.cloudflareaccess\.com$/;

/**
 * The policy for an environment. `teamDomain` is e.g. `ack-emmanuel.cloudflareaccess.com`;
 * `audience` is the Access application's AUD tag. Deployed environments always verify.
 */
export function accessJwtPolicy(input: {
  deployed: boolean;
  teamDomain: string;
  audience: string;
}): AccessJwtPolicy {
  const teamDomain = input.teamDomain.trim().toLowerCase();
  const audience = input.audience.trim();
  if (TEAM_DOMAIN.test(teamDomain) && audience) return { mode: "verify", teamDomain, audience };
  return input.deployed ? { mode: "refuse" } : { mode: "skip" };
}

interface Jwk extends JsonWebKey {
  kid?: string;
}

/** Keys per team domain, kept for an hour in the isolate: one fetch, not one per request. */
const keyCache = new Map<string, { keys: Jwk[]; fetchedAt: number }>();
const KEY_TTL_MS = 60 * 60 * 1000;
/** After an unknown key id, fetch again no more than once a minute (Access rotates keys). */
const REFETCH_MIN_MS = 60 * 1000;

async function teamKeys(
  teamDomain: string,
  fetcher: typeof globalThis.fetch,
  now: number,
  forceRefresh = false,
): Promise<Jwk[]> {
  const cached = keyCache.get(teamDomain);
  const fresh = cached && now - cached.fetchedAt < (forceRefresh ? REFETCH_MIN_MS : KEY_TTL_MS);
  if (cached && fresh) return cached.keys;
  // A network failure or a malformed answer keeps the last good keys (or none), so the request
  // is refused as usual rather than failing with an error.
  try {
    const response = await fetcher(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!response.ok) return cached?.keys ?? [];
    const body = (await response.json()) as { keys?: Jwk[] };
    const keys = Array.isArray(body.keys) ? body.keys : [];
    keyCache.set(teamDomain, { keys, fetchedAt: now });
    return keys;
  } catch {
    return cached?.keys ?? [];
  }
}

/** For tests: forget fetched keys. */
export function clearAccessKeyCache(): void {
  keyCache.clear();
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Allowed clock difference between Cloudflare and the Worker. */
const LEEWAY_S = 60;

/**
 * The claims of `token` if it is a valid Access JWT for this application: RS256, signed by one
 * of the team's current keys, issued by the team, for this application's audience, and not
 * expired. Null otherwise.
 */
async function verifiedClaims(
  token: string | null | undefined,
  policy: Extract<AccessJwtPolicy, { mode: "verify" }>,
  now: Date,
): Promise<Record<string, unknown> | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodeJson(headerPart);
  const payload = decodeJson(payloadPart);
  if (!header || !payload || header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const nowS = Math.floor(now.getTime() / 1000);
  const aud = payload.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  if (!audiences.includes(policy.audience)) return null;
  if (payload.iss !== `https://${policy.teamDomain}`) return null;
  if (typeof payload.exp !== "number" || payload.exp + LEEWAY_S < nowS) return null;
  if (typeof payload.nbf === "number" && payload.nbf - LEEWAY_S > nowS) return null;

  const fetcher = policy.fetch ?? globalThis.fetch;
  let keys = await teamKeys(policy.teamDomain, fetcher, now.getTime());
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await teamKeys(policy.teamDomain, fetcher, now.getTime(), true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk || jwk.kty !== "RSA") return null;

  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlDecode(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
    return valid ? payload : null;
  } catch {
    return null;
  }
}

/**
 * What the Access check found for a request:
 * - `refused`: no valid JWT, or a policy that refuses everything.
 * - `skipped`: local development and tests, where there is no Access in front.
 * - `verified`: a valid JWT, with the email address Access checked (lowercased), or null for a
 *   token without one (a service token).
 */
export type AccessResult =
  { status: "refused" } | { status: "skipped" } | { status: "verified"; email: string | null };

/** Applies the policy to a request's headers. */
export async function checkAccess(
  headers: Headers,
  policy: AccessJwtPolicy,
  now: Date = new Date(),
): Promise<AccessResult> {
  if (policy.mode === "skip") return { status: "skipped" };
  if (policy.mode === "refuse") return { status: "refused" };
  const claims = await verifiedClaims(headers.get(ACCESS_JWT_HEADER), policy, now);
  if (!claims) return { status: "refused" };
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : null;
  return { status: "verified", email: email || null };
}

/**
 * Whether the person Access let through owns the staff account with this email (#91). Access
 * checks who they are by a one-time PIN to that address; without this, a staff member who
 * knew another's password could use their account from behind their own Access login. Always
 * true where Access is skipped (local development); never for a refused request or a token
 * without an email.
 */
export function isAccessIdentity(access: AccessResult, staffEmail: string): boolean {
  if (access.status === "skipped") return true;
  return (
    access.status === "verified" &&
    access.email !== null &&
    access.email === staffEmail.trim().toLowerCase()
  );
}
