import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, type Transaction } from "../../src/db";
import { hmacSha256Hex } from "../../src/lib/crypto";
import type { SendResult, SmsMessage, SmsProvider } from "../../src/modules/notifications";
import {
  redeemRegistrationVerification,
  redeemStatusCheckVerification,
  requestPhoneChallenge,
  verifyPhoneChallenge,
  type OtpDeps,
  type OtpRequest,
} from "../../src/modules/verification";
import { connectTestDrizzle, rolledBack } from "./db";
import { testDatabaseUrl } from "./env";

// Phone OTP (issue #15, FR-2, rule 8) against real Postgres, as app_runtime. Turnstile and the
// SMS provider are fakes: nothing leaves the test.

const db = connectTestDrizzle();
const OTP_SECRET = "test-otp-secret-0123456789abcdef";
const PHONE = "+254700000041";

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

async function asOwner(tx: Transaction, fn: () => Promise<unknown>) {
  await tx.execute(sql`RESET ROLE`);
  await fn();
  await asApp(tx);
}

function harness(options: { human?: boolean; results?: SendResult[] } = {}) {
  const sent: SmsMessage[] = [];
  let turnstileCalls = 0;
  const results = [...(options.results ?? [])];
  const provider: SmsProvider = {
    async send(message) {
      sent.push(message);
      return results.shift() ?? { outcome: "accepted", messageId: `m-${sent.length}` };
    },
    async balance() {
      return 1000;
    },
  };
  const fetch = (async () => {
    turnstileCalls++;
    return new Response(JSON.stringify({ success: options.human ?? true }));
  }) as unknown as typeof globalThis.fetch;
  const deps: OtpDeps = {
    otpSecret: OTP_SECRET,
    rateLimitSecret: "test-rate-limit-secret-0123456789",
    turnstileSecret: "test-turnstile-secret",
    provider,
    fetch,
  };
  const codeFrom = (i = sent.length - 1) => /\b([0-9]{6})\b/.exec(sent[i]!.text)![1]!;
  return { deps, sent, codeFrom, turnstileCalls: () => turnstileCalls };
}

const request = (overrides: Partial<OtpRequest> = {}): OtpRequest => ({
  phone: "0700 000 041",
  purpose: "REGISTRATION",
  language: "en",
  ip: "198.51.100.41",
  turnstileToken: "turnstile-token",
  ...overrides,
});

/** Moves every rate-limit entry and challenge back in time, as if `seconds` had passed. */
async function timePasses(tx: Transaction, seconds: number) {
  await asOwner(tx, async () => {
    await tx.execute(sql`
      UPDATE rate_limit_bucket SET window_start = window_start - make_interval(secs => ${seconds})`);
    await tx.execute(sql`
      UPDATE phone_challenge
         SET created_at = created_at - make_interval(secs => ${seconds}),
             expires_at = expires_at - make_interval(secs => ${seconds}),
             verified_at = verified_at - make_interval(secs => ${seconds})`);
  });
}

async function challenges(tx: Transaction) {
  const { rows } = await tx.execute<{
    id: string;
    phone_e164: string;
    purpose: string;
    code_hash: string;
    attempts: number;
    live: boolean;
    seconds_valid: number;
    verified: boolean;
    consumed: boolean;
  }>(sql`
    SELECT id, phone_e164, purpose, code_hash, attempts, expires_at > now() AS live,
           extract(epoch FROM expires_at - created_at)::int AS seconds_valid,
           verified_at IS NOT NULL AS verified, consumed_at IS NOT NULL AS consumed
      FROM phone_challenge WHERE phone_e164 = ${PHONE} ORDER BY created_at`);
  return rows;
}

describe("requestPhoneChallenge (FR-2, rule 8)", () => {
  it("refuses a number that isn't a Kenyan mobile before Turnstile, storing nothing", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const h = harness();
      for (const phone of ["+255712345678", "0212345678", "not a phone"]) {
        expect(await requestPhoneChallenge(tx, request({ phone }), h.deps)).toEqual({
          ok: false,
          reason: "invalid_phone",
        });
      }
      expect(h.turnstileCalls()).toBe(0);
      expect(h.sent).toHaveLength(0);
    });
  });

  it("refuses a failed Turnstile check without counting it against the limits", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const bot = harness({ human: false });
      expect(await requestPhoneChallenge(tx, request(), bot.deps)).toEqual({
        ok: false,
        reason: "turnstile",
      });
      expect(bot.sent).toHaveLength(0);
      expect(await challenges(tx)).toEqual([]);
      // The refusal used no rate-limit slot: a real visitor can still get a code at once.
      expect((await requestPhoneChallenge(tx, request(), harness().deps)).ok).toBe(true);
    });
  });

  it("sends a 6-digit code valid for 5 minutes and stores only its HMAC", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const h = harness();
      const result = await requestPhoneChallenge(tx, request(), h.deps);
      expect(result).toMatchObject({ ok: true, phoneE164: PHONE });
      const code = h.codeFrom();
      expect(code).toMatch(/^[0-9]{6}$/);
      expect(h.sent[0]).toMatchObject({ to: PHONE });
      expect(h.sent[0]!.trackingId).toBe((result as { challengeId: string }).challengeId);

      const [row] = await challenges(tx);
      expect(row).toMatchObject({ purpose: "REGISTRATION", attempts: 0, live: true });
      expect(row!.seconds_valid).toBe(300);
      expect(row!.code_hash).toBe(await hmacSha256Hex(OTP_SECRET, `otp:${row!.id}:${code}`));
      const { rows } = await tx.execute<{ found: number }>(
        sql`SELECT count(*)::int AS found FROM phone_challenge WHERE row_to_json(phone_challenge)::text LIKE ${`%${code}%`}`,
      );
      expect(rows[0]!.found).toBe(0);
    });
  });

  it("allows a resend only after 60 seconds, and then only the newest code works", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const h = harness();
      const first = await requestPhoneChallenge(tx, request(), h.deps);
      const firstCode = h.codeFrom();
      expect(await requestPhoneChallenge(tx, request(), h.deps)).toEqual({
        ok: false,
        reason: "phone_resend",
      });
      expect(h.sent).toHaveLength(1);

      await timePasses(tx, 61);
      const second = await requestPhoneChallenge(tx, request(), h.deps);
      expect(second.ok).toBe(true);
      expect(h.sent).toHaveLength(2);

      // The first challenge was replaced (it reads as expired, more than 60 s old anyway).
      const old = await verifyPhoneChallenge(
        tx,
        { challengeId: (first as { challengeId: string }).challengeId, code: firstCode },
        OTP_SECRET,
      );
      expect(old).toEqual({ ok: false, reason: "expired" });
      const fresh = await verifyPhoneChallenge(
        tx,
        { challengeId: (second as { challengeId: string }).challengeId, code: h.codeFrom() },
        OTP_SECRET,
      );
      expect(fresh.ok).toBe(true);
    });
  });

  it("sends at most 3 codes per phone per hour", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const h = harness();
      for (let i = 0; i < 3; i++) {
        expect((await requestPhoneChallenge(tx, request(), h.deps)).ok).toBe(true);
        await timePasses(tx, 61);
      }
      expect(await requestPhoneChallenge(tx, request(), h.deps)).toEqual({
        ok: false,
        reason: "phone_hourly",
      });
      expect(h.sent).toHaveLength(3);
      // After the hour, it can again.
      await timePasses(tx, 3600);
      expect((await requestPhoneChallenge(tx, request(), h.deps)).ok).toBe(true);
    });
  });

  it("answers as if sent when the daily cap pauses sending (D25)", async () => {
    await rolledBack(db, async (tx) => {
      await asOwner(tx, async () => {
        await tx.execute(sql`UPDATE sms_setting SET value = 0 WHERE key = 'daily_cap'`);
      });
      const h = harness();
      expect(await requestPhoneChallenge(tx, request(), h.deps)).toMatchObject({ ok: true });
      expect(h.sent).toHaveLength(0);
    });
  });

  it("reports a failed send and leaves no usable challenge", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const h = harness({ results: [{ outcome: "rejected", code: "0422" }] });
      expect(await requestPhoneChallenge(tx, request(), h.deps)).toEqual({
        ok: false,
        reason: "send_failed",
      });
      expect((await challenges(tx))[0]!.live).toBe(false);
    });
  });

  it("keeps the earlier code working when a resend fails (the first SMS may still be on its way)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const h = harness({
        results: [
          { outcome: "accepted", messageId: "m-1" },
          { outcome: "rejected", code: "0422" },
        ],
      });
      const first = await requestPhoneChallenge(tx, request(), h.deps);
      const firstCode = h.codeFrom(0);
      await timePasses(tx, 61);
      expect(await requestPhoneChallenge(tx, request(), h.deps)).toEqual({
        ok: false,
        reason: "send_failed",
      });
      const result = await verifyPhoneChallenge(
        tx,
        { challengeId: (first as { challengeId: string }).challengeId, code: firstCode },
        OTP_SECRET,
      );
      expect(result.ok).toBe(true);
    });
  });

  it("keeps the earlier code working when the daily cap pauses a resend", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const h = harness();
      const first = await requestPhoneChallenge(tx, request(), h.deps);
      const firstCode = h.codeFrom(0);
      await timePasses(tx, 61);
      await asOwner(tx, async () => {
        await tx.execute(sql`UPDATE sms_setting SET value = 0 WHERE key = 'daily_cap'`);
      });
      expect((await requestPhoneChallenge(tx, request(), h.deps)).ok).toBe(true);
      expect(h.sent).toHaveLength(1);
      const result = await verifyPhoneChallenge(
        tx,
        { challengeId: (first as { challengeId: string }).challengeId, code: firstCode },
        OTP_SECRET,
      );
      expect(result.ok).toBe(true);
    });
  });
});

/** A sent challenge and its code. */
async function sentChallenge(tx: Transaction, purpose: OtpRequest["purpose"] = "REGISTRATION") {
  const h = harness();
  const result = await requestPhoneChallenge(tx, request({ purpose }), h.deps);
  return { challengeId: (result as { challengeId: string }).challengeId, code: h.codeFrom() };
}

describe("verifyPhoneChallenge (FR-2)", () => {
  it("allows 5 attempts; after that even the right code is refused", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { challengeId, code } = await sentChallenge(tx);
      const wrong = code === "000000" ? "111111" : "000000";
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(await verifyPhoneChallenge(tx, { challengeId, code: wrong }, OTP_SECRET));
      }
      expect(results).toEqual([
        { ok: false, reason: "wrong_code", attemptsLeft: 4 },
        { ok: false, reason: "wrong_code", attemptsLeft: 3 },
        { ok: false, reason: "wrong_code", attemptsLeft: 2 },
        { ok: false, reason: "wrong_code", attemptsLeft: 1 },
        { ok: false, reason: "too_many_attempts" },
      ]);
      expect(await verifyPhoneChallenge(tx, { challengeId, code }, OTP_SECRET)).toEqual({
        ok: false,
        reason: "too_many_attempts",
      });
    });
  });

  it("counts a malformed code as an attempt", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { challengeId } = await sentChallenge(tx);
      expect(await verifyPhoneChallenge(tx, { challengeId, code: "12ab" }, OTP_SECRET)).toEqual({
        ok: false,
        reason: "wrong_code",
        attemptsLeft: 4,
      });
    });
  });

  it("refuses a code after 5 minutes without using an attempt", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { challengeId, code } = await sentChallenge(tx);
      await timePasses(tx, 301);
      expect(await verifyPhoneChallenge(tx, { challengeId, code }, OTP_SECRET)).toEqual({
        ok: false,
        reason: "expired",
      });
      expect((await challenges(tx))[0]!.attempts).toBe(0);
    });
  });

  it("accepts the right code once, with spaces trimmed, and returns a token", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { challengeId, code } = await sentChallenge(tx);
      const result = await verifyPhoneChallenge(tx, { challengeId, code: ` ${code} ` }, OTP_SECRET);
      expect(result).toMatchObject({ ok: true });
      expect((result as { token: string }).token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(await verifyPhoneChallenge(tx, { challengeId, code }, OTP_SECRET)).toEqual({
        ok: false,
        reason: "invalid",
      });
      expect(
        await verifyPhoneChallenge(
          tx,
          { challengeId: "00000000-0000-4000-8000-000000000000", code },
          OTP_SECRET,
        ),
      ).toEqual({ ok: false, reason: "invalid" });
    });
  });
});

/** A registration row, made as the owner, for evidence to refer to. */
async function registration(tx: Transaction, reference = "REG-QTP2K"): Promise<string> {
  let id = "";
  await asOwner(tx, async () => {
    const { rows } = await tx.execute<{ id: string }>(sql`
      INSERT INTO registration (reference, channel, language)
      VALUES (${reference}, 'SELF', 'en') RETURNING id`);
    id = rows[0]!.id;
  });
  return id;
}

async function verifiedToken(tx: Transaction, purpose: OtpRequest["purpose"] = "REGISTRATION") {
  const { challengeId, code } = await sentChallenge(tx, purpose);
  const result = await verifyPhoneChallenge(tx, { challengeId, code }, OTP_SECRET);
  return (result as { token: string }).token;
}

async function evidenceFor(tx: Transaction, registrationId: string) {
  const evidence = await tx.execute<{
    kind: string;
    phone_e164: string;
    actor_user_id: string | null;
  }>(sql`
    SELECT kind, phone_e164, actor_user_id FROM verification_evidence
     WHERE registration_id = ${registrationId} ORDER BY at`);
  const entries = await tx.execute<{
    action: string;
    actor_type: string;
    actor_id: string | null;
    after: unknown;
    request_id: string | null;
  }>(sql`
    SELECT action, actor_type, actor_id, after, request_id FROM audit_entry
     WHERE entity_type = 'registration' AND entity_id = ${registrationId} ORDER BY id`);
  return { evidence: evidence.rows, audit: entries.rows };
}

describe("redeemRegistrationVerification (#15, BR-11, rule 4)", () => {
  it("spends the token and records PHONE_OTP evidence with its audit entry", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const token = await verifiedToken(tx);
      const registrationId = await registration(tx);
      expect(
        await redeemRegistrationVerification(
          tx,
          {
            token,
            phoneE164: PHONE,
            registrationId,
            actor: { type: "PUBLIC" },
            requestId: "req-otp",
          },
          OTP_SECRET,
        ),
      ).toBe(true);
      expect(await evidenceFor(tx, registrationId)).toEqual({
        evidence: [{ kind: "PHONE_OTP", phone_e164: PHONE, actor_user_id: null }],
        audit: [
          {
            action: "registration.verify_phone",
            actor_type: "PUBLIC",
            actor_id: null,
            after: { evidence: "PHONE_OTP" },
            request_id: "req-otp",
          },
        ],
      });
      expect((await challenges(tx))[0]).toMatchObject({ verified: true, consumed: true });
    });
  });

  it("records the officer for an assisted registration (FR-3)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const token = await verifiedToken(tx);
      const registrationId = await registration(tx);
      const actor = { type: "STAFF", userId: "officer-1" } as const;
      expect(
        await redeemRegistrationVerification(
          tx,
          { token, phoneE164: PHONE, registrationId, actor },
          OTP_SECRET,
        ),
      ).toBe(true);
      const { evidence, audit } = await evidenceFor(tx, registrationId);
      expect(evidence[0]!.actor_user_id).toBe("officer-1");
      expect(audit[0]).toMatchObject({ actor_type: "STAFF", actor_id: "officer-1" });
    });
  });

  it("records nothing without a valid token for this exact phone and purpose, and works only once", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const token = await verifiedToken(tx);
      await timePasses(tx, 61); // a second code for the same phone needs the 60-second wait
      const statusToken = await verifiedToken(tx, "STATUS_CHECK");
      const registrationId = await registration(tx);
      const redeem = (over: Partial<{ token: string; phoneE164: string }>) =>
        redeemRegistrationVerification(
          tx,
          { token, phoneE164: PHONE, registrationId, actor: { type: "PUBLIC" }, ...over },
          OTP_SECRET,
        );

      expect(await redeem({ phoneE164: "+254700000042" })).toBe(false);
      expect(await redeem({ token: statusToken })).toBe(false);
      expect(await redeem({ token: "made-up" })).toBe(false);
      expect(await redeem({ token: "" })).toBe(false);
      expect(await evidenceFor(tx, registrationId)).toEqual({ evidence: [], audit: [] });

      expect(await redeem({})).toBe(true);
      expect(await redeem({})).toBe(false);
      expect((await evidenceFor(tx, registrationId)).evidence).toHaveLength(1);
    });
  });

  it("stays unspent if the submission rolls back, so the member can retry", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const token = await verifiedToken(tx);
      const registrationId = await registration(tx);
      const verification = {
        token,
        phoneE164: PHONE,
        registrationId,
        actor: { type: "PUBLIC" },
      } as const;
      await expect(
        tx.transaction(async (submission) => {
          expect(await redeemRegistrationVerification(submission, verification, OTP_SECRET)).toBe(
            true,
          );
          throw new Error("the submission failed");
        }),
      ).rejects.toThrow("the submission failed");
      expect(await evidenceFor(tx, registrationId)).toEqual({ evidence: [], audit: [] });
      expect(await redeemRegistrationVerification(tx, verification, OTP_SECRET)).toBe(true);
    });
  });
});

describe("redeemStatusCheckVerification (FR-7)", () => {
  it("works once, only for a status-check token and its phone", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const registrationToken = await verifiedToken(tx);
      await timePasses(tx, 61); // a second code for the same phone needs the 60-second wait
      const token = await verifiedToken(tx, "STATUS_CHECK");
      const redeem = (over: Partial<{ token: string; phoneE164: string }>) =>
        redeemStatusCheckVerification(tx, { token, phoneE164: PHONE, ...over }, OTP_SECRET);
      expect(await redeem({ token: registrationToken })).toBe(false);
      expect(await redeem({ phoneE164: "+254700000042" })).toBe(false);
      expect(await redeem({})).toBe(true);
      expect(await redeem({})).toBe(false);
    });
  });

  it("expires 15 minutes after the code was verified", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const token = await verifiedToken(tx, "STATUS_CHECK");
      await timePasses(tx, 15 * 60 + 1);
      expect(await redeemStatusCheckVerification(tx, { token, phoneE164: PHONE }, OTP_SECRET)).toBe(
        false,
      );
    });
  });
});

describe("phone_challenge constraints (migration 0006)", () => {
  it("refuses a token without verification, and either without the other", async () => {
    await rolledBack(db, async (tx) => {
      const refused = (statement: ReturnType<typeof sql>) =>
        expect(tx.transaction((savepoint) => savepoint.execute(statement))).rejects.toMatchObject({
          cause: { code: "23514" },
        });
      await refused(sql`
        INSERT INTO phone_challenge (phone_e164, purpose, code_hash, expires_at, token_hash)
        VALUES ('+254700000044', 'REGISTRATION', 'h', now(), 't')`);
      await refused(sql`
        INSERT INTO phone_challenge (phone_e164, purpose, code_hash, expires_at, verified_at)
        VALUES ('+254700000044', 'REGISTRATION', 'h', now(), now())`);
      await refused(sql`
        INSERT INTO phone_challenge (phone_e164, purpose, code_hash, expires_at, consumed_at)
        VALUES ('+254700000044', 'REGISTRATION', 'h', now(), now())`);
    });
  });
});

describe("under concurrency (separate connections)", () => {
  it("lets only one of two simultaneous right answers through, and redeems a token once", async () => {
    const pool = createDb(testDatabaseUrl());
    const challengeId = crypto.randomUUID();
    const code = "246810";
    try {
      await pool.db.execute(sql`
        INSERT INTO phone_challenge (id, phone_e164, purpose, code_hash, expires_at)
        VALUES (${challengeId}, '+254700000043', 'STATUS_CHECK',
                ${await hmacSha256Hex(OTP_SECRET, `otp:${challengeId}:${code}`)},
                now() + interval '5 minutes')`);
      const verifies = await Promise.all(
        [0, 1].map(() => verifyPhoneChallenge(pool.db, { challengeId, code }, OTP_SECRET)),
      );
      const winners = verifies.filter((r) => r.ok);
      expect(winners).toHaveLength(1);
      expect(verifies.filter((r) => !r.ok)).toEqual([{ ok: false, reason: "invalid" }]);

      const token = (winners[0] as { token: string }).token;
      const redemption = { token, phoneE164: "+254700000043" };
      const redeemed = await Promise.all(
        [0, 1].map(() =>
          pool.db.transaction((tx) => redeemStatusCheckVerification(tx, redemption, OTP_SECRET)),
        ),
      );
      expect(redeemed.filter(Boolean)).toHaveLength(1);
    } finally {
      await pool.db.execute(sql`DELETE FROM phone_challenge WHERE id = ${challengeId}`);
      await pool.close();
    }
  });
});
