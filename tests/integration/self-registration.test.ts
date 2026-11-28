import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import type { SmsProvider } from "../../src/modules/notifications";
import {
  checkSelfRegistration,
  PRIVACY_NOTICE_VERSION,
  REFERENCE_PATTERN,
  submitSelfRegistration,
  type SelfRegistrationFields,
} from "../../src/modules/registration";
import { requestPhoneChallenge, verifyPhoneChallenge } from "../../src/modules/verification";
import { connectTestDrizzle, rolledBack } from "./db";

// Self-registration (issue #16, FR-1) against real Postgres, as app_runtime. Turnstile and the
// SMS provider are fakes. All data is synthetic.

const db = connectTestDrizzle();
const OTP_SECRET = "test-otp-secret-0123456789abcdef";

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

/** A verification token for `phone`, through the real OTP flow (#15) with fakes around it. */
async function verified(tx: Transaction, phone: string, ip = "198.51.100.60"): Promise<string> {
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
    { phone, purpose: "REGISTRATION", language: "en", ip, turnstileToken: "t" },
    { otpSecret: OTP_SECRET, rateLimitSecret: "rl-secret", turnstileSecret: "ts", provider, fetch },
  );
  const challengeId = (request as { challengeId: string }).challengeId;
  const code = /\b([0-9]{6})\b/.exec(sent[0]!)![1]!;
  const result = await verifyPhoneChallenge(tx, { challengeId, code }, OTP_SECRET);
  return (result as { token: string }).token;
}

async function fields(tx: Transaction, over: Partial<SelfRegistrationFields> = {}) {
  const input: SelfRegistrationFields = {
    fullName: "Test Person",
    isNewMember: false,
    fwoNumber: "0042",
    phone: "0700 000 061",
    hbcId: await idOf(tx, "hbc", "Judea"),
    departmentIds: [await idOf(tx, "department", "English Choir")],
    adultDeclared: true,
    privacyAcknowledged: true,
    transferConsent: true,
    ...over,
  };
  const checked = checkSelfRegistration(input);
  if (!checked.ok) throw new Error("test fields invalid");
  return checked.value;
}

async function submit(
  tx: Transaction,
  over: Partial<SelfRegistrationFields> = {},
  token?: string,
  language: "en" | "sw" = "sw",
) {
  const registration = await fields(tx, over);
  return submitSelfRegistration(
    tx,
    {
      registration,
      language,
      verificationToken: token ?? (await verified(tx, registration.phoneE164)),
      requestId: "req-reg",
    },
    OTP_SECRET,
  );
}

async function stored(tx: Transaction, registrationId: string) {
  const reg = await tx.execute<Record<string, unknown>>(sql`
    SELECT reference, channel, status, language, fwo_conflict, phone_conflict, current_revision_no
      FROM registration WHERE id = ${registrationId}`);
  const revision = await tx.execute<Record<string, unknown>>(sql`
    SELECT full_name, fwo_number, phone_e164, adult_declared, transfer_consent, is_new_member,
           privacy_notice_version, submitted_by_user_id
      FROM registration_revision WHERE registration_id = ${registrationId}`);
  const departments = await tx.execute<{ name: string }>(sql`
    SELECT d.name FROM registration_revision_department r JOIN department d ON d.id = r.department_id
     WHERE r.registration_id = ${registrationId}`);
  const evidence = await tx.execute<{ kind: string }>(
    sql`SELECT kind FROM verification_evidence WHERE registration_id = ${registrationId}`,
  );
  const audit = await tx.execute<{ action: string; actor_type: string; after: unknown }>(sql`
    SELECT action, actor_type, after FROM audit_entry
     WHERE entity_type = 'registration' AND entity_id = ${registrationId} ORDER BY id`);
  return {
    registration: reg.rows[0],
    revision: revision.rows[0],
    departments: departments.rows.map((d) => d.name),
    evidence: evidence.rows.map((e) => e.kind),
    audit: audit.rows,
  };
}

async function outbox(tx: Transaction, smsId: string) {
  const { rows } = await tx.execute<Record<string, unknown>>(sql`
    SELECT phone_e164, template, language, params, status FROM sms_outbox WHERE id = ${smsId}`);
  return rows[0];
}

async function count(tx: Transaction, table: string) {
  const { rows } = await tx.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`,
  );
  return rows[0]!.n;
}

describe("submitSelfRegistration (FR-1)", () => {
  it("stores the registration, revision, departments, evidence, audit and SMS together", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const result = await submit(tx);
      expect(result).toMatchObject({ ok: true });
      const { reference, registrationId, smsId } = result as {
        reference: string;
        registrationId: string;
        smsId: string;
      };
      expect(reference).toMatch(REFERENCE_PATTERN);

      expect(await stored(tx, registrationId)).toEqual({
        registration: {
          reference,
          channel: "SELF",
          status: "SUBMITTED",
          language: "sw",
          fwo_conflict: false,
          phone_conflict: false,
          current_revision_no: 1,
        },
        revision: {
          full_name: "Test Person",
          fwo_number: "42", // typed as 0042: leading zeros don't count (D61)
          phone_e164: "+254700000061",
          adult_declared: true,
          transfer_consent: true,
          is_new_member: false,
          privacy_notice_version: PRIVACY_NOTICE_VERSION,
          submitted_by_user_id: null,
        },
        departments: ["English Choir"],
        evidence: ["PHONE_OTP"],
        audit: [
          {
            action: "registration.verify_phone",
            actor_type: "PUBLIC",
            after: { evidence: "PHONE_OTP" },
          },
          {
            action: "registration.submit",
            actor_type: "PUBLIC",
            after: {
              status: "SUBMITTED",
              channel: "SELF",
              revisionNo: 1,
              isNewMember: false,
              fwoConflict: false,
              phoneConflict: false,
              departments: 1,
            },
          },
        ],
      });
      expect(await outbox(tx, smsId)).toEqual({
        phone_e164: "+254700000061",
        template: "registration.submitted",
        language: "sw",
        params: { reference },
        status: "PENDING",
      });
    });
  });

  it("registers a new member without an FWO number, with the new-member SMS (BR-16)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const result = await submit(
        tx,
        { isNewMember: true, fwoNumber: "", departmentIds: [] },
        undefined,
        "en",
      );
      const { registrationId, smsId } = result as { registrationId: string; smsId: string };
      const { revision, departments } = await stored(tx, registrationId);
      expect(revision).toMatchObject({ fwo_number: null, is_new_member: true });
      expect(departments).toEqual([]);
      expect(await outbox(tx, smsId)).toMatchObject({
        template: "registration.submitted_new_member",
        language: "en",
      });
    });
  });
});

describe("conflicts are accepted and flagged silently (BR-03, BR-06, rule 3)", () => {
  async function member(tx: Transaction, fwo: string, phone: string, status = "ACTIVE") {
    await asOwner(tx, () =>
      tx.execute(sql`
        INSERT INTO member (fwo_number, full_name, phone_e164, status, status_reason)
        VALUES (${fwo}, 'Existing Member', ${phone}, ${status},
                ${status === "ACTIVE" ? null : "Test"})`),
    );
  }

  async function flags(tx: Transaction, result: unknown) {
    expect(result).toMatchObject({ ok: true });
    const { registration } = await stored(
      tx,
      (result as { registrationId: string }).registrationId,
    );
    return { fwo: registration!.fwo_conflict, phone: registration!.phone_conflict };
  }

  it("flags an FWO held by a member, and a phone held by an active member", async () => {
    await rolledBack(db, async (tx) => {
      await member(tx, "7001", "+254700000062");
      expect(await flags(tx, await submit(tx, { fwoNumber: "7001", phone: "0700000062" }))).toEqual(
        {
          fwo: true,
          phone: true,
        },
      );
    });
  });

  it("flags an FWO on another open registration, but not on a rejected one", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await submit(tx, { fwoNumber: "7002", phone: "0700000063" });
      expect(await flags(tx, await submit(tx, { fwoNumber: "7002", phone: "0700000064" }))).toEqual(
        {
          fwo: true,
          phone: false,
        },
      );

      await asOwner(tx, () =>
        tx.execute(sql`
          UPDATE registration r SET status = 'REJECTED'
            FROM registration_revision v
           WHERE v.registration_id = r.id AND v.fwo_number = '7002'`),
      );
      expect(await flags(tx, await submit(tx, { fwoNumber: "7002", phone: "0700000065" }))).toEqual(
        {
          fwo: false,
          phone: false,
        },
      );
    });
  });

  it("doesn't flag a phone held only by a deceased member", async () => {
    await rolledBack(db, async (tx) => {
      await member(tx, "7003", "+254700000066", "DECEASED");
      expect(await flags(tx, await submit(tx, { fwoNumber: "7004", phone: "0700000066" }))).toEqual(
        {
          fwo: false,
          phone: false,
        },
      );
    });
  });
});

describe("refusals store nothing", () => {
  it("refuses a token verified for another phone, or already spent", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const before = {
        registrations: await count(tx, "registration"),
        sms: await count(tx, "sms_outbox"),
      };
      const otherPhoneToken = await verified(tx, "+254700000067", "198.51.100.61");
      expect(await submit(tx, { phone: "0700000068" }, otherPhoneToken)).toEqual({
        ok: false,
        reason: "verification",
      });

      const token = await verified(tx, "+254700000069", "198.51.100.62");
      expect((await submit(tx, { phone: "0700000069" }, token)).ok).toBe(true);
      expect(await submit(tx, { phone: "0700000069", fwoNumber: "9999" }, token)).toEqual({
        ok: false,
        reason: "verification",
      });
      expect({
        registrations: await count(tx, "registration"),
        sms: await count(tx, "sms_outbox"),
      }).toEqual({
        registrations: before.registrations + 1,
        sms: before.sms + 1,
      });
    });
  });

  it("refuses a deactivated HBC or department without spending the token", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const hbcId = await idOf(tx, "hbc", "Samaria");
      await asOwner(tx, () =>
        tx.execute(sql`UPDATE hbc SET is_active = false WHERE id = ${hbcId}`),
      );
      const token = await verified(tx, "+254700000070");
      expect(await submit(tx, { hbcId, phone: "0700000070" }, token)).toEqual({
        ok: false,
        reason: "units",
        hbcUnavailable: true,
        unavailableDepartmentIds: [],
      });
      // The token is still good for a corrected submission.
      expect((await submit(tx, { phone: "0700000070" }, token)).ok).toBe(true);
    });
  });
});
