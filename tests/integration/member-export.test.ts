import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import { exportActiveMembers } from "../../src/modules/membership";
import { parseCsv } from "../../src/modules/membership/csv";
import { connectTestDrizzle, rolledBack } from "./db";

// The CSV export (issue #25, FR-12) against real Postgres, as app_runtime: active members only,
// their open HBC and departments, safe from formula injection, and every export recorded with
// the number of rows (BR-12, D31). Every member here is synthetic.

const db = connectTestDrizzle();
const ADMIN = { type: "STAFF", userId: "test-admin-25" } as const;

async function idOf(tx: Transaction, table: "hbc" | "department", name: string) {
  const { rows } = await tx.execute<{ id: string }>(
    sql`SELECT id FROM ${sql.identifier(table)} WHERE name = ${name}`,
  );
  return rows[0]!.id;
}

/** A member in Judea with the given departments; FWO numbers start 25 so they're ours. */
async function aMember(
  tx: Transaction,
  m: { fwo: string; name: string; phone: string | null; status?: string; departments?: string[] },
) {
  const status = m.status ?? "ACTIVE";
  const { rows } = await tx.execute<{ id: string }>(sql`
    INSERT INTO member (fwo_number, full_name, phone_e164, language, status, status_reason)
    VALUES (${m.fwo}, ${m.name}, ${m.phone}, 'en', ${status},
            ${status === "ACTIVE" ? null : "Synthetic reason"})
    RETURNING id`);
  const id = rows[0]!.id;
  await tx.execute(sql`
    INSERT INTO member_hbc_assignment (member_id, hbc_id, valid_from)
    VALUES (${id}, ${await idOf(tx, "hbc", "Judea")}, now() - interval '1 day')`);
  for (const name of m.departments ?? []) {
    await tx.execute(sql`
      INSERT INTO department_membership (member_id, department_id, state, valid_from)
      VALUES (${id}, ${await idOf(tx, "department", name)}, 'DECLARED', now() - interval '1 day')`);
  }
  return id;
}

/** The export's rows that are ours, as parsed fields, header first. */
function ours(csv: string): string[][] {
  expect(csv.startsWith("﻿")).toBe(true);
  const parsed = parseCsv(csv.slice(1));
  if (!parsed.ok) throw new Error("unreadable export");
  const [header, ...rows] = parsed.rows;
  return [header!, ...rows.filter((r) => /^'?25\d{4}$/.test(r[0]!))];
}

describe("exportActiveMembers (FR-12)", () => {
  it("exports active members only, by name, with phone, HBC and open departments", async () => {
    await rolledBack(db, async (tx) => {
      const withChoirs = await aMember(tx, {
        fwo: "250002",
        name: "Test Bravo",
        phone: "+254700250002",
        departments: ["KAYO", "English Choir"],
      });
      // A department left since: its period is closed, so it isn't exported.
      await tx.execute(sql`
        UPDATE department_membership SET valid_to = now()
         WHERE member_id = ${withChoirs}
           AND department_id = ${await idOf(tx, "department", "KAYO")}`);
      await aMember(tx, { fwo: "250001", name: "Test Alpha", phone: null });
      for (const [i, status] of ["INACTIVE", "DECEASED", "TRANSFERRED_OUT"].entries()) {
        await aMember(tx, { fwo: `25009${i}`, name: `Test ${status}`, phone: null, status });
      }
      await tx.execute(sql`SET LOCAL ROLE app_runtime`);

      const result = await exportActiveMembers(tx, { actor: ADMIN });
      expect(ours(result.csv)).toEqual([
        ["fwo_number", "full_name", "phone", "hbc", "departments"],
        ["250001", "Test Alpha", "", "Judea", ""],
        ["250002", "Test Bravo", "0700 250 002", "Judea", "English Choir"],
      ]);
      // Every active member in the database, ours and any others.
      const { rows } = await tx.execute<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM member WHERE status = 'ACTIVE'`,
      );
      expect(result.rows).toBe(rows[0]!.n);
    });
  });

  it("makes a value that would run as a formula plain text (CSV injection)", async () => {
    await rolledBack(db, async (tx) => {
      await aMember(tx, { fwo: "250003", name: '=HYPERLINK("http://example.org")', phone: null });
      await tx.execute(sql`SET LOCAL ROLE app_runtime`);
      const { csv } = await exportActiveMembers(tx, { actor: ADMIN });
      expect(ours(csv)[1]).toEqual([
        "250003",
        `'=HYPERLINK("http://example.org")`,
        "",
        "Judea",
        "",
      ]);
    });
  });

  it("records every export with who and how many rows, never the contents (BR-12, D31)", async () => {
    await rolledBack(db, async (tx) => {
      await aMember(tx, { fwo: "250004", name: "Test Charlie", phone: "+254700250004" });
      await tx.execute(sql`SET LOCAL ROLE app_runtime`);
      const { rows: exported } = await exportActiveMembers(tx, {
        actor: ADMIN,
        requestId: "req-25",
      });

      const { rows } = await tx.execute(sql`
        SELECT actor_type, actor_id, action, entity_type, entity_id, before, after, request_id,
               at > now() - interval '1 minute' AS recent
          FROM audit_entry ORDER BY id DESC LIMIT 1`);
      expect(rows[0]).toEqual({
        actor_type: "STAFF",
        actor_id: "test-admin-25",
        action: "member.export",
        entity_type: "member",
        entity_id: "*",
        before: null,
        after: { rows: exported },
        request_id: "req-25",
        recent: true,
      });
    });
  });
});
