import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { Database } from "../../db";
import * as authSchema from "../../db/schema/auth";
import { isSecureCookieHost } from "../../lib/hosts";

export interface AuthConfig {
  db: Database;
  secret: string;
  /** The admin origin, e.g. https://admin.ackemmanuelfreretown.org */
  baseURL: string;
}

const APP_NAME = "ACK Emmanuel Freretown - Kengeleni";

/**
 * How long a session can last at most, whatever the staff member does. The idle timeouts that
 * matter (D32: 30 minutes, or 4 hours for Registration Officers alone) are shorter and are
 * enforced by `requireStaff`; this matches Cloudflare Access's 24-hour session in front of it.
 */
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * The Better Auth endpoints the staff portal uses. Every other endpoint (password reset, email
 * change, account deletion, OTP by email or SMS, disabling the second factor…) answers 404.
 * Staff accounts are created by a Super Administrator (FR-10), not through Better Auth.
 */
const ALLOWED_AUTH_PATHS: ReadonlySet<string> = new Set([
  "/sign-in/email",
  "/sign-out",
  "/get-session",
  "/two-factor/enable",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
]);

/** Paths that create a session only after a second factor has been checked. */
const SECOND_FACTOR_PATHS = new Set(["/two-factor/verify-totp", "/two-factor/verify-backup-code"]);

/** Better Auth's cookies. Each gets the `__Host-` prefix on https. */
const COOKIES = [
  "session_token",
  "session_data",
  "dont_remember",
  "account_data",
  "two_factor",
  "trust_device",
] as const;

/**
 * Cookie names and attributes for the admin host. On https every cookie is `__Host-`: Secure,
 * `Path=/`, and no `Domain`, so the browser sends it only to the exact admin host (FR-10), never
 * to the public site. On a loopback host (local development, E2E) the prefix and `Secure` are
 * dropped, as for the public site's cookies (see `isSecureCookieHost`).
 */
export function staffCookies(baseURL: string) {
  const secure = isSecureCookieHost(new URL(baseURL).host);
  const prefix = secure ? "__Host-" : "";
  const cookies: Record<string, { name: string; attributes: CookieAttributes }> = {};
  for (const name of COOKIES) {
    cookies[name] = {
      name: `${prefix}ack-staff.${name}`,
      attributes: { secure, path: "/", sameSite: "lax", httpOnly: true },
    };
  }
  return cookies;
}

interface CookieAttributes {
  secure: boolean;
  path: "/";
  sameSite: "lax";
  httpOnly: true;
}

/**
 * Staff authentication (FR-10). Members never sign in in Release 1.
 * - No self sign-up: Super Administrators create staff users (`pnpm staff:bootstrap` for the
 *   first one).
 * - Email and password, then an authenticator app (TOTP). A staff member who hasn't set one
 *   up can only reach the enrolment page. SMS and email codes are never a second factor, and
 *   no device is ever trusted to skip it.
 * - Sessions are rows in the database (no cookie cache), so revoking one takes effect on the
 *   next request. Better Auth never extends them; `requireStaff` applies the idle timeouts.
 * - Rate limits are kept in the database: a Worker's memory isn't shared between requests.
 *
 * Build one per request, for the admin origin the request came to.
 */
export function createAuth({ db, secret, baseURL }: AuthConfig) {
  return betterAuth({
    appName: APP_NAME,
    secret,
    baseURL,
    basePath: "/api/auth",
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
    },
    session: {
      expiresIn: SESSION_MAX_AGE_SECONDS,
      disableSessionRefresh: true,
      cookieCache: { enabled: false },
      additionalFields: {
        /** True only for a session created after an authenticator code or backup code. */
        twoFactorVerified: { type: "boolean", required: true, defaultValue: false, input: false },
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "staffRateLimit",
    },
    advanced: {
      useSecureCookies: false, // the __Host- prefix is set per cookie in staffCookies()
      cookies: staffCookies(baseURL),
      // Cloudflare sets CF-Connecting-IP on every request; a client cannot override it.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    telemetry: { enabled: false },
    databaseHooks: {
      session: {
        create: {
          before: async (session, ctx) => ({
            data: { ...session, twoFactorVerified: SECOND_FACTOR_PATHS.has(ctx?.path ?? "") },
          }),
        },
      },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!ALLOWED_AUTH_PATHS.has(ctx.path)) throw new APIError("NOT_FOUND");
        const body = (ctx.body ?? {}) as Record<string, unknown>;
        // No trusted devices: every sign-in asks for the second factor.
        if (body.trustDevice) throw new APIError("BAD_REQUEST", { message: "Not allowed" });
        // An authenticator app only; never a code sent by email or SMS.
        if (
          ctx.path === "/two-factor/enable" &&
          body.method !== undefined &&
          body.method !== "totp"
        ) {
          throw new APIError("BAD_REQUEST", { message: "Not allowed" });
        }
      }),
    },
    plugins: [twoFactor({ issuer: APP_NAME })],
  });
}

export type Auth = ReturnType<typeof createAuth>;
