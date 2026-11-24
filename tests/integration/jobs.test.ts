import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";
import { schema } from "../../src/db";
import { redactExpiredRegistrations } from "../../src/modules/audit";
import { purgeExpiredChallenges } from "../../src/modules/verification";
import { connectTestDb } from "./db";

// Daily jobs (issue #10, database-design.md §6) against real Postgres. Each test runs in a
// transaction that is rolled back. The jobs run as app_runtime, so the grants are tested too.

const client = connectTestDb();
const db = drizzle(client, { schema });

async function asApp<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("SET LOCAL ROLE app_runtime");
  try {
    return await fn();
  } finally {
    await client.query("RESET ROLE");
  }
}

async function challenge(age: string): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO phone_challenge (phone_e164, purpose, code_hash, expires_at, created_at)
     VALUES ('+254700000009', 'REGISTRATION', 'hash', now() - $1::interval + interval '5 minutes',
             now() - $1::interval)
     RETURNING id`,
    [age],
  );
  return rows[0]!.id;
}

describe("otp.purge", () => {
  it("deletes challenges older than 24 hours and keeps newer ones, idempotently", async () => {
    const old = await challenge("25 hours");
    const recent = await challenge("23 hours");

    expect(await asApp(() => purgeExpiredChallenges(db))).toBe(1);
    expect(await asApp(() => purgeExpiredChallenges(db))).toBe(0);

    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM phone_challenge WHERE id = ANY($1)",
      [[old, recent]],
    );
    expect(rows.map((r) => r.id)).toEqual([recent]);
  });
});

/** A registration rejected (or withdrawn) `age` ago, with one revision holding personal details. */
async function decided(reference: string, age: string, action = "REJECT"): Promise<string> {
  const status = action === "REJECT" ? "REJECTED" : "WITHDRAWN";
  // The guard trigger forbids backdating, rightly; switch it off for setup only.
  await client.query("ALTER TABLE registration DISABLE TRIGGER registration_guard");
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO registration (reference, channel, language, status, decided_at)
     VALUES ($1, 'SELF', 'sw', $2, now() - $3::interval) RETURNING id`,
    [reference, status, age],
  );
  await client.query("ALTER TABLE registration ENABLE TRIGGER registration_guard");
  const id = rows[0]!.id;
  await client.query(
    `INSERT INTO registration_decision (registration_id, action, reason, actor_user_id, at)
     VALUES ($1, $2, 'Test', 'staff-1', now() - $3::interval)`,
    [id, action, age],
  );
  const hbc = await client.query<{ id: string }>("SELECT id FROM hbc WHERE name = 'Jordan'");
  await client.query(
    `INSERT INTO registration_revision
       (registration_id, revision_no, full_name, fwo_number, phone_e164, hbc_id,
        adult_declared, transfer_consent, privacy_notice_version)
     VALUES ($1, 1, 'Test Person', '8100', '+254700000010', $2, true, true, 'v1')`,
    [id, hbc.rows[0]!.id],
  );
  return id;
}

async function redactedAt(id: string) {
  const { rows } = await client.query<{ at: Date | null; name: string | null }>(
    `SELECT r.personal_data_redacted_at AS at, v.full_name AS name
       FROM registration r JOIN registration_revision v ON v.registration_id = r.id
      WHERE r.id = $1`,
    [id],
  );
  return rows[0]!;
}

describe("retention.redact", () => {
  it("redacts registrations decided more than 12 months ago, idempotently, and audits each", async () => {
    const rejected = await decided("REG-JKBA2", "13 months");
    const withdrawn = await decided("REG-JKBA3", "13 months", "WITHDRAW");
    const recent = await decided("REG-JKBA4", "11 months");

    expect(await asApp(() => redactExpiredRegistrations(db))).toEqual({ redacted: 2, failed: 0 });
    expect(await asApp(() => redactExpiredRegistrations(db))).toEqual({ redacted: 0, failed: 0 });

    for (const id of [rejected, withdrawn]) {
      const row = await redactedAt(id);
      expect(row.at).not.toBeNull();
      expect(row.name).toBeNull();
    }
    expect(await redactedAt(recent)).toEqual({ at: null, name: "Test Person" });

    const audit = await client.query<{ n: string }>(
      `SELECT count(*) AS n FROM audit_entry
        WHERE action = 'registration.redact' AND entity_id = ANY($1)`,
      [[rejected, withdrawn]],
    );
    expect(audit.rows[0]!.n).toBe("2");
  });

  it("skips a registration whose decision record is not yet 12 months old", async () => {
    const id = await decided("REG-JKBA5", "13 months");
    await client.query("UPDATE registration_decision SET at = now() WHERE registration_id = $1", [
      id,
    ]);
    expect(await asApp(() => redactExpiredRegistrations(db))).toEqual({ redacted: 0, failed: 0 });
  });
});
