import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins/two-factor";
import type { Database } from "../../db";
import * as authSchema from "../../db/schema/auth";

export interface AuthConfig {
  db: Database;
  secret: string;
  /** The admin origin, e.g. https://admin.ackemmanuelfreretown.org */
  baseURL: string;
}

const APP_NAME = "ACK Emmanuel Kengeleni-Freretown";

/**
 * Staff authentication (FR-10). Members never sign in in Release 1.
 * - No self sign-up: Super Administrators create staff users.
 * - Second factor: passkey or authenticator app. SMS is never a second factor.
 * The HTTP handler and session/role checks are wired when the admin sign-in is built.
 */
export function createAuth({ db, secret, baseURL }: AuthConfig) {
  const { hostname } = new URL(baseURL);
  return betterAuth({
    appName: APP_NAME,
    secret,
    baseURL,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
    },
    telemetry: { enabled: false },
    plugins: [
      twoFactor({ issuer: APP_NAME }),
      passkey({ rpID: hostname, rpName: APP_NAME, origin: baseURL }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
