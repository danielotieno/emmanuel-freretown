import { and, eq, gt, isNull, ne, sql, type SQL } from "drizzle-orm";
import { safeQuery, type DbOrTx, type Transaction } from "../../db";
import { phoneChallenge, verificationEvidence } from "../../db/schema";
import { hmacSha256Hex, timingSafeEqual } from "../../lib/crypto";
import * as audit from "../audit";
import { sendOtpSms, type SmsProvider } from "../notifications";
import { normalizeKenyanPhone } from "./phone";
import { checkOtpSendLimits } from "./rate-limit";
import { verifyTurnstile } from "./turnstile";

/** FR-2: a code is valid for 5 minutes and allows 5 attempts. */
export const OTP_VALID_SECONDS = 5 * 60;
export const OTP_MAX_ATTEMPTS = 5;
/**
 * How long a verification token can be redeemed after the code was verified. Not set by the
 * requirements: long enough to finish and submit the form, short enough that a token can't
 * linger (#15).
 */
export const TOKEN_VALID_SECONDS = 15 * 60;

export type OtpPurpose = "REGISTRATION" | "STATUS_CHECK";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A 6-digit code, uniform over 000000–999999, from the platform's secure random source. */
export function generateOtpCode(): string {
  // 4,294,000,000 is the largest multiple of 1,000,000 below 2^32; values above it would make
  // low codes slightly more likely, so they are drawn again.
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value);
  while (value[0]! >= 4_294_000_000);
  return String(value[0]! % 1_000_000).padStart(6, "0");
}

/** The stored form of a code: HMAC-SHA256 with the server secret, bound to its challenge. */
export function otpCodeHash(secret: string, challengeId: string, code: string): Promise<string> {
  return hmacSha256Hex(secret, `otp:${challengeId}:${code}`);
}

function tokenHash(secret: string, token: string): Promise<string> {
  return hmacSha256Hex(secret, `token:${token}`);
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export interface OtpRequest {
  /** The phone number as typed; anything that isn't a Kenyan mobile is refused. */
  phone: string;
  purpose: OtpPurpose;
  /** The SMS language: the form's language. */
  language: "en" | "sw";
  /** The client's IP (CF-Connecting-IP), for the per-IP limit. */
  ip: string;
  turnstileToken: string;
}

export interface OtpDeps {
  /** OTP_SECRET: keys the code and token hashes. */
  otpSecret: string;
  /** RATE_LIMIT_SECRET: keys the rate-limit buckets. */
  rateLimitSecret: string;
  /** TURNSTILE_SECRET_KEY. */
  turnstileSecret: string;
  provider: SmsProvider;
  /** For tests: the fetch used for Turnstile. */
  fetch?: typeof fetch;
  /**
   * For automated tests only: replaces the random code (the app's test mode, which can't run
   * where SMS are real). Never set in staging or production.
   */
  generateCode?: () => string;
}

export type OtpRequestResult =
  /** A code was sent, or the daily cap paused sending: the public sees the same (D25). */
  | { ok: true; challengeId: string; phoneE164: string }
  | {
      ok: false;
      reason:
        "invalid_phone" | "turnstile" | "ip" | "phone_resend" | "phone_hourly" | "send_failed";
    };

/**
 * Sends an OTP (FR-2, rule 8). In order: the phone must be a Kenyan mobile; Turnstile must pass;
 * the rate limits (20 per IP per hour, a resend after 60 seconds, 3 per phone per hour) must
 * have room. Then a new challenge is created and its code goes out by SMS; once it is sent, it
 * replaces any earlier unverified one for the same phone and purpose, so only the latest code
 * works.
 *
 * Nothing here looks at the registry: the answer never says whether a phone belongs to anyone
 * (rule 3). The code exists only in memory and in the SMS; the database holds its HMAC. Pass a
 * database, not a transaction: the SMS is sent outside any transaction.
 */
export async function requestPhoneChallenge(
  db: DbOrTx,
  request: OtpRequest,
  deps: OtpDeps,
): Promise<OtpRequestResult> {
  const phoneE164 = normalizeKenyanPhone(request.phone);
  if (!phoneE164) return { ok: false, reason: "invalid_phone" };

  const human = await verifyTurnstile(request.turnstileToken, {
    secret: deps.turnstileSecret,
    ip: request.ip,
    fetch: deps.fetch,
  });
  if (!human) return { ok: false, reason: "turnstile" };

  const limits = await checkOtpSendLimits(db, { phoneE164, ip: request.ip }, deps.rateLimitSecret);
  if (!limits.allowed) return { ok: false, reason: limits.reason };

  const challengeId = crypto.randomUUID();
  const code = (deps.generateCode ?? generateOtpCode)();
  const codeHash = await otpCodeHash(deps.otpSecret, challengeId, code);
  await safeQuery(() =>
    db.insert(phoneChallenge).values({
      id: challengeId,
      phoneE164,
      purpose: request.purpose,
      codeHash,
      expiresAt: sql`now() + make_interval(secs => ${OTP_VALID_SECONDS})`,
    }),
  );

  const sent = await sendOtpSms(db, deps.provider, {
    phoneE164,
    code,
    language: request.language,
    trackingId: challengeId,
  });
  if (sent === "failed") {
    await expire(db, eq(phoneChallenge.id, challengeId));
    return { ok: false, reason: "send_failed" };
  }
  // Only once the new code is on its way does it replace the earlier ones. If the resend
  // failed or the cap paused it, the code the member already has (perhaps still in transit)
  // keeps working.
  if (sent === "sent") {
    await expire(
      db,
      and(
        eq(phoneChallenge.phoneE164, phoneE164),
        eq(phoneChallenge.purpose, request.purpose),
        ne(phoneChallenge.id, challengeId),
        isNull(phoneChallenge.verifiedAt),
        gt(phoneChallenge.expiresAt, sql`now()`),
      ),
    );
  }
  return { ok: true, challengeId, phoneE164 };
}

async function expire(db: DbOrTx, where: SQL | undefined): Promise<void> {
  await safeQuery(() =>
    db
      .update(phoneChallenge)
      .set({ expiresAt: sql`now()` })
      .where(where),
  );
}

export type OtpVerifyResult =
  | { ok: true; token: string }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" }
  | { ok: false; reason: "wrong_code"; attemptsLeft: number };

/**
 * Checks a code (FR-2). The challenge row is locked for the check, so concurrent attempts are
 * counted one by one and only one can succeed. A wrong code uses an attempt; after the fifth,
 * even the right code is refused and the member asks for a new one. An expired challenge (5
 * minutes, by the database clock) or one already verified is refused without using an attempt.
 *
 * The comparison is constant-time. A correct code returns a single-use verification token,
 * stored only as an HMAC; redeem it with `redeemRegistrationVerification` or
 * `redeemStatusCheckVerification` in the transaction that submits the form.
 */
export async function verifyPhoneChallenge(
  db: DbOrTx,
  attempt: { challengeId: string; code: string },
  otpSecret: string,
): Promise<OtpVerifyResult> {
  if (!UUID.test(attempt.challengeId)) return { ok: false, reason: "invalid" };
  const code = attempt.code.trim();
  return safeQuery(() =>
    db.transaction(async (tx): Promise<OtpVerifyResult> => {
      const [row] = await tx
        .select({
          codeHash: phoneChallenge.codeHash,
          attempts: phoneChallenge.attempts,
          verifiedAt: phoneChallenge.verifiedAt,
          live: sql<boolean>`${phoneChallenge.expiresAt} > now()`,
        })
        .from(phoneChallenge)
        .where(eq(phoneChallenge.id, attempt.challengeId))
        .for("update");
      if (!row || row.verifiedAt) return { ok: false, reason: "invalid" };
      if (!row.live) return { ok: false, reason: "expired" };
      if (row.attempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" };

      // A malformed code is still compared (and counted), so its handling takes the same path.
      const expected = await otpCodeHash(otpSecret, attempt.challengeId, code);
      if (!/^[0-9]{6}$/.test(code) || !timingSafeEqual(expected, row.codeHash)) {
        const attempts = row.attempts + 1;
        await tx
          .update(phoneChallenge)
          .set({ attempts })
          .where(eq(phoneChallenge.id, attempt.challengeId));
        return attempts >= OTP_MAX_ATTEMPTS
          ? { ok: false, reason: "too_many_attempts" }
          : { ok: false, reason: "wrong_code", attemptsLeft: OTP_MAX_ATTEMPTS - attempts };
      }

      const token = newToken();
      await tx
        .update(phoneChallenge)
        .set({ verifiedAt: sql`now()`, tokenHash: await tokenHash(otpSecret, token) })
        .where(eq(phoneChallenge.id, attempt.challengeId));
      return { ok: true, token };
    }),
  );
}

/**
 * Spends a verification token: true once, for the phone and purpose it was issued for, within
 * 15 minutes of the code being verified; false otherwise, and for every later call. One
 * statement marks it consumed, so two concurrent submissions can't both use it.
 *
 * It runs inside the transaction that submits the form. That binds the token to the submission:
 * if the submission fails and rolls back, the token is still unused and the member can retry;
 * if it commits, the token is spent and can't be replayed for another form.
 */
async function redeemVerificationToken(
  tx: Transaction,
  redemption: { token: string; phoneE164: string; purpose: OtpPurpose },
  otpSecret: string,
): Promise<boolean> {
  if (!redemption.token || redemption.token.length > 128) return false;
  const hash = await tokenHash(otpSecret, redemption.token);
  const redeemed = await safeQuery(() =>
    tx
      .update(phoneChallenge)
      .set({ consumedAt: sql`now()` })
      .where(
        and(
          eq(phoneChallenge.tokenHash, hash),
          eq(phoneChallenge.phoneE164, redemption.phoneE164),
          eq(phoneChallenge.purpose, redemption.purpose),
          isNull(phoneChallenge.consumedAt),
          sql`${phoneChallenge.verifiedAt} > now() - make_interval(secs => ${TOKEN_VALID_SECONDS})`,
        ),
      )
      .returning({ id: phoneChallenge.id }),
  );
  return redeemed.length === 1;
}

/** Who verified a registration's phone: the member themselves, or the officer at the desk. */
export type PhoneVerificationActor = { type: "PUBLIC" } | audit.StaffActor;

/**
 * For a registration being submitted (FR-1, FR-3): spends a REGISTRATION token for the
 * registration's phone and, only if that succeeds, records `PHONE_OTP` evidence (BR-11) with a
 * `registration.verify_phone` audit entry (rule 4). One call, so evidence can never be recorded
 * without a verified, unspent token for that exact phone. Returns false, recording nothing, if
 * the token isn't valid for this phone; the caller then refuses the submission.
 *
 * Call it inside the transaction that creates the registration, after the registration row
 * exists (the evidence refers to it): see `redeemVerificationToken` for why.
 */
export async function redeemRegistrationVerification(
  tx: Transaction,
  verification: {
    token: string;
    phoneE164: string;
    registrationId: string;
    actor: PhoneVerificationActor;
    requestId?: string;
  },
  otpSecret: string,
): Promise<boolean> {
  const { token, phoneE164, registrationId, actor, requestId } = verification;
  if (
    !(await redeemVerificationToken(tx, { token, phoneE164, purpose: "REGISTRATION" }, otpSecret))
  ) {
    return false;
  }
  await safeQuery(() =>
    tx.insert(verificationEvidence).values({
      registrationId,
      kind: "PHONE_OTP",
      phoneE164,
      actorUserId: actor.type === "STAFF" ? actor.userId : null,
    }),
  );
  await audit.write(tx, {
    actor,
    action: "registration.verify_phone",
    entityType: "registration",
    entityId: registrationId,
    after: { evidence: "PHONE_OTP" },
    requestId,
  });
  return true;
}

/**
 * For the status check (FR-7, BR-13): spends a STATUS_CHECK token for the phone the member
 * verified. Only a true result allows showing anything; call it in the transaction that reads
 * the status. Records no evidence: no registration is created.
 */
export async function redeemStatusCheckVerification(
  tx: Transaction,
  verification: { token: string; phoneE164: string },
  otpSecret: string,
): Promise<boolean> {
  return redeemVerificationToken(tx, { ...verification, purpose: "STATUS_CHECK" }, otpSecret);
}
