import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { connectTestDb } from "./db";

// Migration 0015 (D61, #155): FWO numbers already stored are rewritten without their leading
// zeros. Each test puts back the old CHECKs' freedom inside its own transaction (rolled back),
// stores numbers the way D29 allowed, and runs the migration's SQL again. All data is synthetic.

const db = connectTestDb();
const MIGRATION = readFileSync(
  new URL("../../src/db/migrations/0015_fwo_without_leading_zeros.sql", import.meta.url),
  "utf8",
);

async function allowLeadingZeros() {
  await db.query(`
    ALTER TABLE member DROP CONSTRAINT member_fwo_number_check;
    ALTER TABLE registration_revision DROP CONSTRAINT registration_revision_fwo_number_check;
    ALTER TABLE fwo_setting DROP CONSTRAINT fwo_setting_highest_issued_check;`);
}

async function member(fwo: string) {
  await db.query("INSERT INTO member (fwo_number, full_name) VALUES ($1, 'Test Member')", [fwo]);
}

describe("migration 0015: FWO numbers without leading zeros (D61)", () => {
  it("rewrites members, revisions and the setting, and writes one SYSTEM entry with counts", async () => {
    await allowLeadingZeros();
    await member("0061001");
    await member("000");
    await member("61003");
    const { rows: reg } = await db.query<{ id: string }>(
      "INSERT INTO registration (reference, channel, language) VALUES ('REG-DDDDD', 'SELF', 'en') RETURNING id",
    );
    await db.query(
      `INSERT INTO registration_revision
         (registration_id, revision_no, full_name, fwo_number, phone_e164, hbc_id,
          adult_declared, transfer_consent, privacy_notice_version)
       VALUES ($1, 1, 'Test Person', '061004', '+254700061004',
               (SELECT id FROM hbc ORDER BY name LIMIT 1), true, true, 'v1')`,
      [reg[0]!.id],
    );
    await db.query(`
      INSERT INTO fwo_setting (highest_issued, updated_by_user_id) VALUES ('0061000', 'test')
      ON CONFLICT (singleton) DO UPDATE SET highest_issued = EXCLUDED.highest_issued`);

    await db.query(MIGRATION);

    const { rows: members } = await db.query<{ fwo_number: string }>(
      "SELECT fwo_number FROM member WHERE full_name = 'Test Member' ORDER BY fwo_number",
    );
    expect(members.map((m) => m.fwo_number)).toEqual(["0", "61001", "61003"]);
    const { rows: revision } = await db.query(
      "SELECT fwo_number FROM registration_revision WHERE registration_id = $1",
      [reg[0]!.id],
    );
    expect(revision[0]!.fwo_number).toBe("61004");
    const { rows: setting } = await db.query("SELECT highest_issued FROM fwo_setting");
    expect(setting[0]!.highest_issued).toBe("61000");

    const { rows: audit } = await db.query(
      `SELECT actor_type, actor_id, entity_type, entity_id, after FROM audit_entry
        WHERE action = 'member.drop_fwo_leading_zeros'`,
    );
    expect(audit).toEqual([
      {
        actor_type: "SYSTEM",
        actor_id: null,
        entity_type: "member",
        entity_id: "*",
        after: { members: 2, revisions: 1, setting: 1 },
      },
    ]);
  });

  it("writes no audit entry when no number has a leading zero", async () => {
    await member("63001");
    await db.query(MIGRATION);
    const { rows } = await db.query(
      "SELECT 1 FROM audit_entry WHERE action = 'member.drop_fwo_leading_zeros'",
    );
    expect(rows).toEqual([]);
  });

  it("stops, naming no number, when two members' numbers differ only by leading zeros", async () => {
    await allowLeadingZeros();
    await member("062001");
    await member("62001");
    const error = await db.query(MIGRATION).then(
      () => null,
      (e: Error) => e,
    );
    expect(error?.message).toMatch(/differ only by leading zeros/);
    expect(error?.message).not.toMatch(/[0-9]{3}/);
  });
});
