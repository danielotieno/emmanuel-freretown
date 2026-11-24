import { NextResponse, type NextRequest } from "next/server";

const ADMIN_PREFIX = "/admin";

/** Hostnames that serve the staff portal. Exact matches only (ADR 0002 amendment). */
const ADMIN_HOSTNAMES = new Set([
  "admin.ackemmanuelfreretown.org",
  "admin-staging.ackemmanuelfreretown.org",
  "admin.localhost",
]);

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
 */
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const { pathname } = request.nextUrl;
  let response: NextResponse;

  if (ADMIN_HOSTNAMES.has(hostnameOf(request))) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? ADMIN_PREFIX : `${ADMIN_PREFIX}${pathname}`;
    response = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  } else if (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)) {
    response = new NextResponse("Not found", { status: 404 });
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  response.headers.set("Content-Security-Policy", csp);
  return response;
}

function hostnameOf(request: NextRequest): string {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  return host.replace(/:\d+$/, "");
}

function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === "development";
  // Turnstile (challenges.cloudflare.com) is added to script-src and frame-src with the
  // registration form, not before.
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Next.js and React inject inline style attributes; styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws:" : ""}`,
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
  ];
  return directives.join("; ");
}

export const config = {
  // Everything except Next.js build assets, so no /admin path can bypass the host check.
  matcher: ["/((?!_next/static/|_next/image/).*)"],
};
