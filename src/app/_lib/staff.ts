import "server-only";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import {
  accessJwtPolicy,
  createAuth,
  handleAuthRequest as handleAuthRequestInModule,
  passesAccess,
  requireEnrollingStaff as enrollingStaffInModule,
  requirePasswordChange as passwordChangeInModule,
  requireStaff as requireStaffInModule,
  StaffAccessError,
  type AccessJwtPolicy,
  type Auth,
  type EnrollingStaff,
  type RoleRequirement,
  type Scope,
  type Staff,
  type StaffRequest,
} from "@/modules/access";
import { adminOrigin } from "@/lib/hosts";
import { getDb } from "./db";
import { getEnv, secret } from "./env";
import { getLogger } from "./log";

/**
 * The Cloudflare Access check: verified on the real staff hosts, which refuse everything if
 * `CF_ACCESS_TEAM_DOMAIN` or `CF_ACCESS_AUD` is missing. Skipped only on a loopback host
 * (`admin.localhost`, local development and tests) in an environment that isn't staging or
 * production, and only while neither setting is present, so a misconfiguration fails closed.
 */
function accessPolicy(env: Record<string, unknown>, baseURL: string): AccessJwtPolicy {
  const deployed = ["staging", "production"].includes(secret(env, "SENTRY_ENVIRONMENT"));
  return accessJwtPolicy({
    deployed: deployed || baseURL.startsWith("https://"),
    teamDomain: secret(env, "CF_ACCESS_TEAM_DOMAIN"),
    audience: secret(env, "CF_ACCESS_AUD"),
  });
}

/** Better Auth's settings for this request's admin origin. Null on any other host. */
const getAuthConfig = cache(async (): Promise<{ secret: string; baseURL: string } | null> => {
  const baseURL = adminOrigin((await headers()).get("host"));
  if (!baseURL) return null;
  const authSecret = secret(await getEnv(), "BETTER_AUTH_SECRET");
  if (authSecret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET is missing or shorter than 32 characters.");
  }
  return { secret: authSecret, baseURL };
});

/** Better Auth for this request, on the admin origin it came to. Null on any other host. */
const getAuth = cache(async (): Promise<Auth | null> => {
  const config = await getAuthConfig();
  return config ? createAuth({ db: await getDb(), ...config }) : null;
});

async function staffRequest(): Promise<StaffRequest | null> {
  const config = await getAuthConfig();
  const auth = await getAuth();
  if (!config || !auth) return null;
  return {
    db: await getDb(),
    auth,
    headers: new Headers(await headers()),
    access: accessPolicy(await getEnv(), config.baseURL),
  };
}

/** Turns a refusal into a redirect or a 404. Logs the reason, never who it was. */
async function refuse(error: unknown): Promise<never> {
  if (!(error instanceof StaffAccessError)) throw error;
  (await getLogger()).info("staff.refused", { reason: error.reason });
  if (error.reason === "idle_timeout") redirect("/sign-in?timeout=1");
  if (error.reason === "signed_out") redirect("/sign-in");
  if (error.reason === "password_change_required") redirect("/change-password");
  if (error.reason === "second_factor_required") redirect("/enrol");
  // Wrong host, no Access JWT, or no role for this: give nothing away.
  notFound();
}

/**
 * The first line of every admin page, server action and route handler (CLAUDE.md rule 1):
 *
 *   const staff = await requireStaff("MEMBERSHIP_ADMIN");
 *
 * The role is always written out: one role, a list of roles any one of which will do (work two
 * roles share, such as corrections), or `null` for any staff member with an active role, which
 * is for pages every staff member may see, never for actions.
 * Returns the signed-in staff member, or redirects to sign-in or enrolment, or answers 404.
 * The checks themselves are `requireStaff` in src/modules/access.
 */
export async function requireStaff(role: RoleRequirement, scope?: Scope): Promise<Staff> {
  return check((req) => requireStaffInModule(req, role, scope));
}

/** For the enrolment page: the staff member who must set up an authenticator app, or null. */
export async function requireEnrollingStaff(): Promise<EnrollingStaff | null> {
  return check(enrollingStaffInModule);
}

/**
 * For the change-password page and its action: the signed-in staff member, `forced` while they
 * hold a temporary password from a Super Administrator.
 */
export async function requirePasswordChange(): Promise<Staff & { forced: boolean }> {
  return check(passwordChangeInModule);
}

/** Runs one of the access module's checks on this request; a refusal redirects or answers 404. */
async function check<T>(run: (req: StaffRequest) => Promise<T>): Promise<T> {
  const req = await staffRequest();
  if (!req) notFound();
  try {
    return await run(req);
  } catch (error) {
    return refuse(error);
  }
}

/**
 * Serves Better Auth's endpoints on the admin host only, behind the Access check. Which
 * endpoints answer, and how, is set in src/modules/access/auth.ts.
 */
export async function handleAuthRequest(request: Request): Promise<Response> {
  const config = await getAuthConfig();
  const env = await getEnv();
  if (!config || !(await passesAccess(request.headers, accessPolicy(env, config.baseURL)))) {
    return new Response("Not found", { status: 404 });
  }
  // Better Auth routes by path under /api/auth. The middleware rewrites admin requests into
  // the /admin tree; give Better Auth the path the browser used.
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/admin(?=\/)/, "");
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const forwarded = new Request(url, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
  });
  return handleAuthRequestInModule(await getDb(), config, forwarded);
}
