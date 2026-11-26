import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import { hmacSha256Hex } from "../../src/lib/crypto";
import type { SmsProvider } from "../../src/modules/notifications";
import {
  checkAssistedRegistration,
  findAssistedSubmission,
  PRIVACY_NOTICE_VERSION,
  REFERENCE_PATTERN,
  submitAssistedRegistration,
  type AssistedRegistrationFields,
} from "../../src/modules/registration";
import {
  checkDeskSms,
  requestPhoneChallenge,
  verifyPhoneChallenge,
} from "../../src/modules/verification";
import { connectTestDrizzle, rolledBack } from "./db";

// Assisted registration at the officer desk (issue #18, FR-3) against real Postgres, as
// app_runtime. Turnstile and the SMS provider are fakes. All people are synthetic; the officer
// is a made-up staff user id (registration.captured_by_user_id has no foreign key).

const db = connectTestDrizzle();
const OTP_SECRET = "test-otp-secret-0123456789abcdef";
const OFFICER = { type: "STAFF", userId: "test-officer-1" } as const;
const EVENT = "Judea HBC AGM, 17 Jan 2027";

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

async function asOwner(tx: Transaction, fn: () => Promise<unknown>) {
  await tx.execute(sql`RESET ROLE`);
  await fn();
  await asApp(tx);
}

async function idOf(tx: Transaction, table: "hbc" | "department", name: string) {
  const { rows } = await tx.execute<{ id: string }>(
    sql`SELECT id FROM ${sql.identifier(table)} WHERE name = ${name}`,
  );
  return rows[0]!.id;
}

/**
 * The officer sends a code to the member's phone and enters what the member reads out: the real
 * OTP flow (#15), counted against the officer, with fakes around it.
 */
async function verifiedAtDesk(tx: Transaction, phone: string): Promise<string> {
  const sent: string[] = [];
  const provider: SmsProvider = {
    send: async (message) => {
      sent.push(message.text);
      return { outcome: "accepted", messageId: "m" };
    },
    balance: async () => 0,
  };
  const fetch = (async () =>
    new Response(JSON.stringify({ success: true }))) as unknown as typeof globalThis.fetch;
  const request = await requestPhoneChallenge(
    tx,
    {
      phone,
      purpose: "REGISTRATION",
      language: "en",
      ip: "198.51.100.80",
      turnstileToken: "t",
      staffUserId: OFFICER.userId,
    },
    { otpSecret: OTP_SECRET, rateLimitSecret: "rl-secret", turnstileSecret: "ts", provider, fetch },
  );
  expect(request.ok).toBe(true);
  const challengeId = (request as { challengeId: string }).challengeId;
  const code = /\b([0-9]{6})\b/.exec(sent[0]!)![1]!;
  const result = await verifyPhoneChallenge(tx, { challengeId, code }, OTP_SECRET);
  return (result as { token: string }).token;
}

async function fields(tx: Transaction, over: Partial<AssistedRegistrationFields> = {}) {
  const input: AssistedRegistrationFields = {
    fullName: "Test Person",
    isNewMember: false,
    fwoNumber: "0042",
    noPersonalPhone: false,
    phone: "0700 000 081",
    hbcId: await idOf(tx, "hbc", "Judea"),
    departmentIds: [await idOf(tx, "department", "Kiswahili Choir")],
    verification: "IN_PERSON",
    eventLabel: EVENT,
    adultDeclared: true,
    privacyAcknowledged: true,
    transferConsent: true,
    readBackConfirmed: true,
    ...over,
  };
  const checked = checkAssistedRegistration(input);
  if (!checked.ok) throw new Error(`test fields invalid: ${JSON.stringify(checked.errors)}`);
  return checked.value;
}

async function submit(
  tx: Transaction,
  over: Partial<AssistedRegistrationFields> = {},
  token?: string,
  submissionId: string = randomUUID(),
) {
  const registration = await fields(tx, over);
  return submitAssistedRegistration(
    tx,
    {
      submissionId,
      registration,
      officer: OFFICER,
      language: "sw",
      verificationToken: token,
      requestId: "req-desk",
    },
    OTP_SECRET,
  );
}

async function stored(tx: Transaction, registrationId: string) {
  const reg = await tx.execute<Record<string, unknown>>(sql`
    SELECT channel, status, language, captured_by_user_id, event_label, fwo_conflict,
           phone_conflict
      FROM registration WHERE id = ${registrationId}`);
  const revision = await tx.execute<Record<string, unknown>>(sql`
    SELECT full_name, fwo_number, phone_e164, no_personal_phone, adult_declared,
           transfer_consent, privacy_notice_version, submitted_by_user_id
      FROM registration_revision WHERE registration_id = ${registrationId}`);
  const departments = await tx.execute<{ name: string }>(sql`
    SELECT d.name FROM registration_revision_department r JOIN department d ON d.id = r.department_id
     WHERE r.registration_id = ${registrationId}`);
  const evidence = await tx.execute<Record<string, unknown>>(sql`
    SELECT kind, phone_e164, actor_user_id, event_label
      FROM verification_evidence WHERE registration_id = ${registrationId}`);
  const audit = await tx.execute<Record<string, unknown>>(sql`
    SELECT action, actor_type, actor_id, after, request_id FROM audit_entry
     WHERE entity_type = 'registration' AND entity_id = ${registrationId} ORDER BY id`);
  return {
    registration: reg.rows[0],
    revision: revision.rows[0],
    departments: departments.rows.map((d) => d.name),
    evidence: evidence.rows,
    audit: audit.rows,
  };
}

async function outbox(tx: Transaction, smsId: string) {
  const { rows } = await tx.execute<Record<string, unknown>>(sql`
    SELECT phone_e164, template, language, params FROM sms_outbox WHERE id = ${smsId}`);
  return rows[0];
}

async function count(tx: Transaction, table: string) {
  const { rows } = await tx.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`,
  );
  return rows[0]!.n;
}

type Stored = { reference: string; registrationId: string; smsId: string | null };

function ok(result: Awaited<ReturnType<typeof submit>>): Stored {
  expect(result).toMatchObject({ ok: true });
  return result as Stored;
}

const SUBMIT_AFTER = {
  status: "SUBMITTED",
  channel: "ASSISTED",
  revisionNo: 1,
  isNewMember: false,
  noPersonalPhone: false,
  fwoConflict: false,
  phoneConflict: false,
  departments: 1,
  readBackConfirmed: true,
  consentGivenVerbally: true,
};

describe("submitAssistedRegistration (FR-3)", () => {
  it("phone at the desk: spends the officer's code check and records PHONE_OTP", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const token = await verifiedAtDesk(tx, "+254700000081");
      const { reference, registrationId, smsId } = ok(
        await submit(tx, { verification: "PHONE_OTP" }, token),
      );
      expect(reference).toMatch(REFERENCE_PATTERN);

      expect(await stored(tx, registrationId)).toEqual({
        registration: {
          channel: "ASSISTED",
          status: "SUBMITTED",
          language: "sw",
          captured_by_user_id: OFFICER.userId,
          event_label: EVENT,
          fwo_conflict: false,
          phone_conflict: false,
        },
        revision: {
          full_name: "Test Person",
          fwo_number: "0042",
          phone_e164: "+254700000081",
          no_personal_phone: false,
          adult_declared: true,
          transfer_consent: true,
          privacy_notice_version: PRIVACY_NOTICE_VERSION,
          submitted_by_user_id: OFFICER.userId,
        },
        departments: ["Kiswahili Choir"],
        evidence: [
          {
            kind: "PHONE_OTP",
            phone_e164: "+254700000081",
            actor_user_id: OFFICER.userId,
            event_label: null,
          },
        ],
        audit: [
          {
            action: "registration.verify_phone",
            actor_type: "STAFF",
            actor_id: OFFICER.userId,
            after: { evidence: "PHONE_OTP" },
            request_id: "req-desk",
          },
          {
            action: "registration.submit",
            actor_type: "STAFF",
            actor_id: OFFICER.userId,
            after: { ...SUBMIT_AFTER, verification: "PHONE_OTP" },
            request_id: "req-desk",
          },
        ],
      });
      // The code was counted against the officer, never against the desk's IP (#18).
      const staffKey = `otp:staff:${await hmacSha256Hex("rl-secret", OFFICER.userId)}`;
      const ipKey = `otp:ip:${await hmacSha256Hex("rl-secret", "198.51.100.80")}`;
      const { rows: buckets } = await tx.execute<{ key: string }>(
        sql`SELECT DISTINCT key FROM rate_limit_bucket WHERE key IN (${staffKey}, ${ipKey})`,
      );
      expect(buckets.map((b) => b.key)).toEqual([staffKey]);
      // The member's SMS in the member's language, which the officer chose (NFR-5).
      expect(await outbox(tx, smsId!)).toEqual({
        phone_e164: "+254700000081",
        template: "registration.submitted",
        language: "sw",
        params: { reference },
      });
    });
  });

  it("phone not at the desk: stores the number unchecked and records IN_PERSON", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { registrationId, smsId } = ok(await submit(tx, { phone: "0700000082" }));
      const { revision, evidence, audit } = await stored(tx, registrationId);
      expect(revision).toMatchObject({ phone_e164: "+254700000082", no_personal_phone: false });
      // The evidence is the officer meeting the member at the event; it never vouches for the
      // phone number.
      expect(evidence).toEqual([
        {
          kind: "IN_PERSON",
          phone_e164: null,
          actor_user_id: OFFICER.userId,
          event_label: EVENT,
        },
      ]);
      expect(audit.map((a) => a.action)).toEqual([
        "registration.verify_in_person",
        "registration.submit",
      ]);
      expect(audit[0]).toMatchObject({ actor_type: "STAFF", after: { evidence: "IN_PERSON" } });
      expect(audit[1]!.after).toEqual({ ...SUBMIT_AFTER, verification: "IN_PERSON" });
      expect(await outbox(tx, smsId!)).toMatchObject({ phone_e164: "+254700000082" });
    });
  });

  it("no personal phone: no number, recorded by the officer, IN_PERSON and no SMS (BR-06)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const sms = await count(tx, "sms_outbox");
      const { registrationId, smsId } = ok(
        await submit(tx, { noPersonalPhone: true, phone: "", isNewMember: true, fwoNumber: "" }),
      );
      expect(smsId).toBeNull();
      expect(await count(tx, "sms_outbox")).toBe(sms);
      const { revision, evidence, audit } = await stored(tx, registrationId);
      expect(revision).toMatchObject({
        phone_e164: null,
        no_personal_phone: true,
        fwo_number: null,
        submitted_by_user_id: OFFICER.userId,
      });
      expect(evidence).toMatchObject([{ kind: "IN_PERSON", actor_user_id: OFFICER.userId }]);
      expect(audit[1]!.after).toMatchObject({ noPersonalPhone: true, isNewMember: true });
    });
  });

  it("a new member with a phone gets the new-member SMS (BR-16)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { smsId } = ok(
        await submit(tx, { phone: "0700000083", isNewMember: true, fwoNumber: "" }),
      );
      expect(await outbox(tx, smsId!)).toMatchObject({
        template: "registration.submitted_new_member",
      });
    });
  });

  it("flags FWO and phone conflicts for the administrator, as for self-registration", async () => {
    await rolledBack(db, async (tx) => {
      await asOwner(tx, () =>
        tx.execute(sql`
          INSERT INTO member (fwo_number, full_name, phone_e164)
          VALUES ('8001', 'Existing Member', '+254700000084')`),
      );
      const { registrationId } = ok(await submit(tx, { fwoNumber: "8001", phone: "0700000084" }));
      const { registration } = await stored(tx, registrationId);
      expect(registration).toMatchObject({ fwo_conflict: true, phone_conflict: true });
    });
  });
});

describe("assisted registration refusals store nothing", () => {
  it("refuses PHONE_OTP without a valid code check for this phone", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const before = {
        registrations: await count(tx, "registration"),
        evidence: await count(tx, "verification_evidence"),
      };
      expect(await submit(tx, { verification: "PHONE_OTP", phone: "0700000085" })).toEqual({
        ok: false,
        reason: "verification",
      });
      const otherPhone = await verifiedAtDesk(tx, "+254700000086");
      expect(
        await submit(tx, { verification: "PHONE_OTP", phone: "0700000085" }, otherPhone),
      ).toEqual({ ok: false, reason: "verification" });
      expect({
        registrations: await count(tx, "registration"),
        evidence: await count(tx, "verification_evidence"),
      }).toEqual(before);
    });
  });

  it("refuses a deactivated department", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const departmentId = await idOf(tx, "department", "Evangelism");
      await asOwner(tx, () =>
        tx.execute(sql`UPDATE department SET is_active = false WHERE id = ${departmentId}`),
      );
      expect(await submit(tx, { departmentIds: [departmentId] })).toEqual({
        ok: false,
        reason: "units",
        hbcUnavailable: false,
        unavailableDepartmentIds: [departmentId],
      });
    });
  });
});

describe("only an officer records 'no personal phone' (database CHECK)", () => {
  it("refuses a revision marked no personal phone without the officer who submitted it", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const { registrationId } = ok(await submit(tx, { noPersonalPhone: true, phone: "" }));
      const hbcId = await idOf(tx, "hbc", "Judea");
      await expect(
        tx.transaction((sp) =>
          sp.execute(sql`
            INSERT INTO registration_revision (registration_id, revision_no, full_name, fwo_number,
              hbc_id, adult_declared, transfer_consent, no_personal_phone, privacy_notice_version)
            VALUES (${registrationId}, 2, 'Test Person', '0042', ${hbcId}, true, true, true,
                    ${PRIVACY_NOTICE_VERSION})`),
        ),
      ).rejects.toThrow();
    });
  });
});

describe("checkDeskSms: the confirmation to an unchecked number (rule 8, #18)", () => {
  const turnstile = (success: boolean) =>
    (async () => new Response(JSON.stringify({ success }))) as unknown as typeof globalThis.fetch;
  const request = {
    phoneE164: "+254700000091",
    staffUserId: OFFICER.userId,
    ip: "198.51.100.90",
    turnstileToken: "t",
  };

  it("refuses without Turnstile and counts nothing", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const before = await count(tx, "rate_limit_bucket");
      expect(
        await checkDeskSms(tx, request, {
          rateLimitSecret: "rl-secret",
          turnstileSecret: "ts",
          fetch: turnstile(false),
        }),
      ).toEqual({ ok: false, reason: "turnstile" });
      expect(await count(tx, "rate_limit_bucket")).toBe(before);
    });
  });

  it("allows three SMS to one phone an hour", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const deps = { rateLimitSecret: "rl-secret", turnstileSecret: "ts", fetch: turnstile(true) };
      for (let i = 0; i < 3; i++)
        expect(await checkDeskSms(tx, request, deps)).toEqual({ ok: true });
      expect(await checkDeskSms(tx, request, deps)).toEqual({ ok: false, reason: "phone_hourly" });
    });
  });
});

describe("a repeated desk submission stores one registration (#18)", () => {
  it("uses the submission id as the registration id", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const submissionId = randomUUID();
      const { registrationId } = ok(
        await submit(tx, { phone: "0700000095" }, undefined, submissionId),
      );
      expect(registrationId).toBe(submissionId);
    });
  });

  it("answers a retry with the stored reference, without a second registration or SMS", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const submissionId = randomUUID();
      const first = ok(await submit(tx, { phone: "0700000096" }, undefined, submissionId));
      const before = {
        registrations: await count(tx, "registration"),
        sms: await count(tx, "sms_outbox"),
        audit: await count(tx, "audit_entry"),
      };
      // A retry after a lost response: the action finds it first...
      expect(await findAssistedSubmission(tx, { submissionId, officer: OFFICER })).toEqual({
        reference: first.reference,
      });
      // ...and a copy that raced past that check is answered from the stored row.
      const again = await tx.transaction(async (sp) =>
        submitAssistedRegistration(
          sp,
          {
            submissionId,
            registration: await fields(tx, { phone: "0700000096" }),
            officer: OFFICER,
            language: "sw",
          },
          OTP_SECRET,
        ),
      );
      expect(again).toEqual({
        ok: true,
        reference: first.reference,
        registrationId: submissionId,
        smsId: null,
        replayed: true,
      });
      expect({
        registrations: await count(tx, "registration"),
        sms: await count(tx, "sms_outbox"),
        audit: await count(tx, "audit_entry"),
      }).toEqual(before);
    });
  });

  it("never finds another officer's submission, and refuses a malformed id", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const submissionId = randomUUID();
      ok(await submit(tx, { phone: "0700000097" }, undefined, submissionId));
      const other = { type: "STAFF", userId: "test-officer-2" } as const;
      expect(await findAssistedSubmission(tx, { submissionId, officer: other })).toBeNull();
      expect(
        await findAssistedSubmission(tx, { submissionId: "REG-ABCDE", officer: OFFICER }),
      ).toBeNull();
      await expect(submit(tx, {}, undefined, submissionId.toUpperCase())).rejects.toThrow();
    });
  });
});
