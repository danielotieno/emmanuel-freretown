import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import type { SmsProvider } from "../../src/modules/notifications";
import {
  approveRegistration,
  checkAssistedRegistration,
  checkRegistrationStatus,
  parseStatusKey,
  rejectRegistration,
  requestCorrection,
  submitAssistedRegistration,
  type AssistedRegistrationFields,
  type StatusKey,
} from "../../src/modules/registration";
import {
  requestPhoneChallenge,
  verifyPhoneChallenge,
  type OtpPurpose,
} from "../../src/modules/verification";
import { connectTestDrizzle, rolledBack } from "./db";

// The membership status check (issue #20, FR-7, BR-13, D24, D48) against real Postgres, as
// app_runtime. Registrations are made at the desk with IN_PERSON evidence; the status check's own
// code goes through the real OTP flow with a fake SMS provider and Turnstile. All data is
// synthetic.

const db = connectTestDrizzle();
const OTP_SECRET = "test-otp-secret-0123456789abcdef";
const OFFICER = { type: "STAFF", userId: "test-officer-20" } as const;
const ADMIN = { type: "STAFF", userId: "test-admin-20" } as const;

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

let counter = 0;
const nextPhone = () => {
  counter++;
  return `+2547002${String(counter).padStart(5, "0")}`;
};

/** A SUBMITTED assisted registration for `phoneE164`; returns its id and reference. */
async function registered(
  tx: Transaction,
  phoneE164: string,
  over: Partial<AssistedRegistrationFields> = {},
) {
  const checked = checkAssistedRegistration({
    fullName: "Test Person Twenty",
    isNewMember: false,
    fwoNumber: `20${String(counter).padStart(4, "0")}`,
    noPersonalPhone: false,
    phone: `0${phoneE164.slice(4)}`,
    hbcId: await idOf(tx, "hbc", "Samaria"),
    departmentIds: [await idOf(tx, "department", "English Choir")],
    verification: "IN_PERSON",
    eventLabel: "Samaria HBC AGM, 24 Jan 2027",
    adultDeclared: true,
    privacyAcknowledged: true,
    transferConsent: true,
    readBackConfirmed: true,
    ...over,
  });
  if (!checked.ok) throw new Error(`test fields invalid: ${JSON.stringify(checked.errors)}`);
  const result = await submitAssistedRegistration(
    tx,
    { submissionId: randomUUID(), registration: checked.value, officer: OFFICER, language: "en" },
    OTP_SECRET,
  );
  if (!result.ok) throw new Error("test registration refused");
  return { id: result.registrationId, reference: result.reference };
}

async function versionOf(tx: Transaction, registrationId: string): Promise<number> {
  const { rows } = await tx.execute<{ version: number }>(
    sql`SELECT version FROM registration WHERE id = ${registrationId}`,
  );
  return rows[0]!.version;
}

async function approve(tx: Transaction, registrationId: string) {
  const result = await approveRegistration(tx, {
    registrationId,
    version: await versionOf(tx, registrationId),
    actor: ADMIN,
  });
  if (!result.ok) throw new Error(`test approval refused: ${JSON.stringify(result)}`);
}

let ipCounter = 0;

/** A verified token for `phoneE164`, through the real OTP flow with fakes around it. */
async function token(
  tx: Transaction,
  phoneE164: string,
  purpose: OtpPurpose = "STATUS_CHECK",
): Promise<string> {
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
  ipCounter++;
  // Several checks per phone in one test: the 60-second resend limit (FR-2) is not under test
  // here, so its buckets are cleared (inside the rolled-back transaction).
  await tx.execute(sql`DELETE FROM rate_limit_bucket`);
  const request = await requestPhoneChallenge(
    tx,
    {
      phone: phoneE164,
      purpose,
      language: "en",
      ip: `198.51.100.${ipCounter}`,
      turnstileToken: "t",
    },
    { otpSecret: OTP_SECRET, rateLimitSecret: "rl-secret", turnstileSecret: "ts", provider, fetch },
  );
  if (!request.ok) throw new Error(`test code refused: ${request.reason}`);
  const code = /\b([0-9]{6})\b/.exec(sent[0]!)![1]!;
  const result = await verifyPhoneChallenge(
    tx,
    { challengeId: request.challengeId, code },
    OTP_SECRET,
  );
  if (!result.ok) throw new Error("test code not verified");
  return result.token;
}

function key(input: string): StatusKey {
  const parsed = parseStatusKey(input);
  if (!parsed) throw new Error("test key invalid");
  return parsed;
}

async function check(
  tx: Transaction,
  phoneE164: string,
  input: string,
  verificationToken?: string,
) {
  return checkRegistrationStatus(
    tx,
    {
      phoneE164,
      key: key(input),
      verificationToken: verificationToken ?? (await token(tx, phoneE164)),
    },
    OTP_SECRET,
  );
}

async function fwoOf(tx: Transaction, registrationId: string) {
  const { rows } = await tx.execute<{ fwo_number: string }>(
    sql`SELECT fwo_number FROM registration_revision WHERE registration_id = ${registrationId}`,
  );
  return rows[0]!.fwo_number;
}

const NOT_FOUND = { ok: true, status: "NOT_FOUND" };

// Each check sends and verifies a real code; against a remote test database a test with several
// checks takes longer than the default 30 seconds. CI's database is local and fast.
describe("checkRegistrationStatus (FR-7)", { timeout: 120_000 }, () => {
  it("shows a submitted registration as received, with its name and HBC (D48)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const phone = nextPhone();
      const { id, reference } = await registered(tx, phone);
      const expected = {
        ok: true,
        status: "RECEIVED",
        fullName: "Test Person Twenty",
        hbcName: "Samaria",
      };
      expect(await check(tx, phone, await fwoOf(tx, id))).toEqual(expected);
      // By reference (D24), whatever its case.
      expect(await check(tx, phone, reference.toLowerCase())).toEqual(expected);
    });
  });

  it("says the Church Secretary will set the HBC of a new member who didn't know it (D49)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const phone = nextPhone();
      const { reference } = await registered(tx, phone, {
        isNewMember: true,
        fwoNumber: "",
        hbcId: "",
        hbcUnknown: true,
      });
      expect(await check(tx, phone, reference)).toEqual({
        ok: true,
        status: "RECEIVED",
        fullName: "Test Person Twenty",
        hbcName: null,
      });
    });
  });

  it("asks the member to contact the office after a correction request or a rejection", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const corrected = nextPhone();
      const a = await registered(tx, corrected);
      await requestCorrection(tx, {
        registrationId: a.id,
        version: await versionOf(tx, a.id),
        reason: "Check the HBC",
        actor: ADMIN,
      });
      expect(await check(tx, corrected, a.reference)).toEqual({
        ok: true,
        status: "CONTACT_OFFICE",
      });

      const rejected = nextPhone();
      const b = await registered(tx, rejected);
      await rejectRegistration(tx, {
        registrationId: b.id,
        version: await versionOf(tx, b.id),
        reason: "Duplicate",
        actor: ADMIN,
      });
      expect(await check(tx, rejected, await fwoOf(tx, b.id))).toEqual({
        ok: true,
        status: "CONTACT_OFFICE",
      });
    });
  });

  it("handles a withdrawn registration explicitly: contact the office", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const phone = nextPhone();
      const { id, reference } = await registered(tx, phone);
      await asOwner(tx, () =>
        tx.execute(sql`UPDATE registration SET status = 'WITHDRAWN' WHERE id = ${id}`),
      );
      expect(await check(tx, phone, reference)).toEqual({ ok: true, status: "CONTACT_OFFICE" });
    });
  });

  it("shows an approved, active member as a registered member, by FWO or reference", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const phone = nextPhone();
      const { id, reference } = await registered(tx, phone);
      await approve(tx, id);
      const expected = {
        ok: true,
        status: "REGISTERED_MEMBER",
        fullName: "Test Person Twenty",
        hbcName: "Samaria",
      };
      expect(await check(tx, phone, await fwoOf(tx, id))).toEqual(expected);
      expect(await check(tx, phone, reference)).toEqual(expected);
    });
  });

  it("shows the member's current name and HBC, not the registration's", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const phone = nextPhone();
      const { id } = await registered(tx, phone);
      await approve(tx, id);
      const fwo = await fwoOf(tx, id);
      await asOwner(tx, async () => {
        await tx.execute(
          sql`UPDATE member SET full_name = 'Test Person Renamed' WHERE fwo_number = ${fwo}`,
        );
        await tx.execute(sql`
          UPDATE member_hbc_assignment SET valid_to = now() + interval '1 second'
           WHERE member_id = (SELECT id FROM member WHERE fwo_number = ${fwo}) AND valid_to IS NULL`);
        await tx.execute(sql`
          INSERT INTO member_hbc_assignment (member_id, hbc_id, valid_from)
          SELECT id, (SELECT id FROM hbc WHERE name = 'Judea'), now() + interval '1 second'
            FROM member WHERE fwo_number = ${fwo}`);
      });
      expect(await check(tx, phone, fwo)).toEqual({
        ok: true,
        status: "REGISTERED_MEMBER",
        fullName: "Test Person Renamed",
        hbcName: "Judea",
      });
    });
  });

  it("finds a member with no registration of their own, such as an imported one (D47)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const phone = nextPhone();
      await asOwner(tx, () =>
        tx.execute(sql`
          WITH m AS (
            INSERT INTO member (fwo_number, full_name, phone_e164, language)
            VALUES ('0042', 'Test Imported Person', ${phone}, 'en') RETURNING id)
          INSERT INTO member_hbc_assignment (member_id, hbc_id)
          SELECT m.id, (SELECT id FROM hbc WHERE name = 'Jordan') FROM m`),
      );
      expect(await check(tx, phone, "0042")).toEqual({
        ok: true,
        status: "REGISTERED_MEMBER",
        fullName: "Test Imported Person",
        hbcName: "Jordan",
      });
      // Leading zeros are significant (D29): "42" is another number.
      expect(await check(tx, phone, "42")).toEqual(NOT_FOUND);
    });
  });

  it("shows the member record when a member and a registration both match, by FWO or reference", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const phone = nextPhone();
      // An imported member (D47), and a duplicate registration with the same FWO and phone,
      // accepted and flagged (BR-03), with a name typed differently.
      await asOwner(tx, () =>
        tx.execute(sql`
          WITH m AS (
            INSERT INTO member (fwo_number, full_name, phone_e164, language)
            VALUES ('0077', 'Test Member Of Record', ${phone}, 'en') RETURNING id)
          INSERT INTO member_hbc_assignment (member_id, hbc_id)
          SELECT m.id, (SELECT id FROM hbc WHERE name = 'Jordan') FROM m`),
      );
      const { id, reference } = await registered(tx, phone, {
        fwoNumber: "0077",
        fullName: "Test Typed Name",
      });
      const expected = {
        ok: true,
        status: "REGISTERED_MEMBER",
        fullName: "Test Member Of Record",
        hbcName: "Jordan",
      };
      expect(await check(tx, phone, "0077")).toEqual(expected);
      expect(await check(tx, phone, reference)).toEqual(expected);

      // Still the member once the duplicate is rejected (D33).
      await rejectRegistration(tx, {
        registrationId: id,
        version: await versionOf(tx, id),
        reason: "Duplicate",
        actor: ADMIN,
      });
      expect(await check(tx, phone, "0077")).toEqual(expected);
      expect(await check(tx, phone, reference)).toEqual(expected);
    });
  });

  it("gives every non-match the same answer (rule 3, BR-13)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const phone = nextPhone();
      const other = nextPhone();
      const { id, reference } = await registered(tx, phone);
      const fwo = await fwoOf(tx, id);

      // The right number with someone else's verified phone.
      expect(await check(tx, other, fwo)).toEqual(NOT_FOUND);
      expect(await check(tx, other, reference)).toEqual(NOT_FOUND);
      // The right phone with a number that isn't theirs, or doesn't exist.
      expect(await check(tx, phone, "999999999")).toEqual(NOT_FOUND);
      expect(await check(tx, phone, "REG-ZZZZZ")).toEqual(NOT_FOUND);
    });
  });

  it("does not find an inactive, deceased or transferred member", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      for (const status of ["INACTIVE", "DECEASED", "TRANSFERRED_OUT"]) {
        const phone = nextPhone();
        const { id, reference } = await registered(tx, phone);
        await approve(tx, id);
        const fwo = await fwoOf(tx, id);
        await asOwner(tx, () =>
          tx.execute(
            sql`UPDATE member SET status = ${status}, status_reason = 'Test' WHERE fwo_number = ${fwo}`,
          ),
        );
        expect(await check(tx, phone, fwo)).toEqual(NOT_FOUND);
        expect(await check(tx, phone, reference)).toEqual(NOT_FOUND);
      }
    });
  });

  it("looks nothing up without a valid, unspent status-check token for that phone", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const phone = nextPhone();
      const { reference } = await registered(tx, phone);
      const refused = { ok: false, reason: "verification" };

      // One code, one answer: the token is spent by the first check, even a non-match.
      const once = await token(tx, phone);
      expect(await check(tx, phone, "999999999", once)).toEqual(NOT_FOUND);
      expect(await check(tx, phone, reference, once)).toEqual(refused);

      // A token for another phone, or for registration, is refused.
      expect(await check(tx, phone, reference, await token(tx, nextPhone()))).toEqual(refused);
      expect(await check(tx, phone, reference, await token(tx, phone, "REGISTRATION"))).toEqual(
        refused,
      );
      expect(await check(tx, phone, reference, "not-a-token")).toEqual(refused);
    });
  });
});
