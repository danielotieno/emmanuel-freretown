import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, usesTurnstile } from "./lib/csp";
import { isAdminHost } from "./lib/hosts";

const ADMIN_PREFIX = "/admin";
const STATUS_CHECK_PATH = "/registration/status";

/**
 * Edge middleware, not Next 16's proxy.ts: proxy.ts always runs on the Node runtime, which
 * OpenNext supports on Cloudflare only experimentally (it returned 500 for any request with
 * a cookie when tested on 24 Nov 2026). Revisit when OpenNext supports it officially.
 *
 * 1. Routes by host: the admin hostnames serve the app/admin tree; other hosts never do.
 *    This is routing only, never the security boundary (CLAUDE.md rule 1): every admin page,
 *    route handler and server action checks the staff session and role itself.
 * 2. Sets a per-request nonce-based Content-Security-Policy. Next.js reads the nonce from the
 *    request header and applies it to its own scripts, so pages must render dynamically.
 * 3. Sends `Cache-Control: no-store` on the status check (FR-7, #20).
 * 4. Sets the request id that every log line for this request carries (NFR-9), and returns it
 *    as X-Request-Id so a staff member can quote it when reporting a problem.
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const adminHost = isAdminHost(request.headers.get("host"));
  const csp = contentSecurityPolicy(nonce, usesTurnstile(request.nextUrl.pathname, adminHost));
  const requestId = requestIdOf(request);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("Content-Security-Policy", csp);

  const { pathname } = request.nextUrl;
  let response: NextResponse;

  if (adminHost) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? ADMIN_PREFIX : `${ADMIN_PREFIX}${pathname}`;
    response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else if (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)) {
    response = new NextResponse("Not found", { status: 404 });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Request-Id", requestId);
  // The status check's answers are personal (FR-7): no browser or cache may keep them.
  if (!adminHost && isStatusCheck(pathname)) response.headers.set("Cache-Control", "no-store");
  return response;
}

function isStatusCheck(pathname: string): boolean {
  return pathname === STATUS_CHECK_PATH || pathname.startsWith(`${STATUS_CHECK_PATH}/`);
}

/**
 * Cloudflare's ray id when present, so our log lines match Cloudflare's own invocation log;
 * otherwise (local development) a random id. Any x-request-id sent by the client is replaced.
 */
function requestIdOf(request: NextRequest): string {
  const ray = request.headers.get("cf-ray");
  return ray && /^[0-9a-f]{16}(-[A-Z]{3})?$/.test(ray) ? ray : crypto.randomUUID();
}

export const config = {
  // Everything except Next.js build assets, so no /admin path can bypass the host check.
  matcher: ["/((?!_next/static/|_next/image/).*)"],
};
