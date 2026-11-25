import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import {
  checkUnitsForRegistration,
  listActiveDepartments,
  listActiveHbcs,
} from "../../src/modules/organisation";
import { connectTestDrizzle, rolledBack } from "./db";

// Organisation lookups (issue #12) against the reference data seeded by migration 0003.
// Lookups run as app_runtime; deactivating a unit for a test runs as the owner, in a
// transaction that is rolled back.

const db = connectTestDrizzle();

const HBCS = [
  "Jordan",
  "Judea",
  "Galilaya",
  "Samaria",
  "Zion Leisure",
  "Zion Bombolulu",
  "Zion Freretown",
  "Damascus",
  "Jerusalem",
  "Bethlehem B",
  "Bethlehem A",
];
const DEPARTMENTS = [
  "Mother's Union",
  "KAMA / AMF",
  "Kiswahili Choir",
  "English Choir",
  "KAYO",
  "Children Ministry",
  "Evangelism",
  "G.F.S.",
];

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

async function idOf(tx: Transaction, table: "hbc" | "department", name: string) {
  const { rows } = await tx.execute<{ id: string }>(
    sql`SELECT id FROM ${sql.identifier(table)} WHERE name = ${name}`,
  );
  return rows[0]!.id;
}

async function deactivate(tx: Transaction, table: "hbc" | "department", name: string) {
  await tx.execute(sql`UPDATE ${sql.identifier(table)} SET is_active = false WHERE name = ${name}`);
}

describe("listActiveHbcs and listActiveDepartments", () => {
  it("list the seeded HBCs and departments in sort order", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const hbcs = await listActiveHbcs(tx);
      const departments = await listActiveDepartments(tx);
      expect(hbcs.map((u) => u.name)).toEqual(HBCS);
      expect(departments.map((u) => u.name)).toEqual(DEPARTMENTS);
      expect(Object.keys(hbcs[0]!).sort()).toEqual(["id", "name"]);
      expect(Object.keys(departments[0]!).sort()).toEqual(["id", "name"]);
    });
  });

  it("leave out deactivated units", async () => {
    await rolledBack(db, async (tx) => {
      await deactivate(tx, "hbc", "Samaria");
      await deactivate(tx, "department", "KAYO");
      await asApp(tx);
      expect((await listActiveHbcs(tx)).map((u) => u.name)).toEqual(
        HBCS.filter((n) => n !== "Samaria"),
      );
      expect((await listActiveDepartments(tx)).map((u) => u.name)).toEqual(
        DEPARTMENTS.filter((n) => n !== "KAYO"),
      );
    });
  });

  it("order by sort order, then name", async () => {
    await rolledBack(db, async (tx) => {
      // A new HBC sharing Jordan's sort order comes after it alphabetically, before Judea.
      await tx.execute(sql`INSERT INTO hbc (name, sort_order) VALUES ('Kanaan', 1)`);
      await asApp(tx);
      expect((await listActiveHbcs(tx)).map((u) => u.name).slice(0, 3)).toEqual([
        "Jordan",
        "Kanaan",
        "Judea",
      ]);
    });
  });
});

describe("checkUnitsForRegistration (database-design.md §3)", () => {
  it("accepts an active HBC with active departments, or with none (BR-05)", async () => {
    await rolledBack(db, async (tx) => {
      const hbcId = await idOf(tx, "hbc", "Judea");
      const choir = await idOf(tx, "department", "English Choir");
      const kayo = await idOf(tx, "department", "KAYO");
      await asApp(tx);
      expect(await checkUnitsForRegistration(tx, { hbcId, departmentIds: [choir, kayo] })).toEqual({
        ok: true,
      });
      expect(await checkUnitsForRegistration(tx, { hbcId, departmentIds: [] })).toEqual({
        ok: true,
      });
    });
  });

  it("rejects a deactivated HBC and deactivated departments", async () => {
    await rolledBack(db, async (tx) => {
      const hbcId = await idOf(tx, "hbc", "Damascus");
      const kayo = await idOf(tx, "department", "KAYO");
      const choir = await idOf(tx, "department", "English Choir");
      await deactivate(tx, "hbc", "Damascus");
      await deactivate(tx, "department", "KAYO");
      await asApp(tx);
      expect(await checkUnitsForRegistration(tx, { hbcId, departmentIds: [choir, kayo] })).toEqual({
        ok: false,
        hbcUnavailable: true,
        unavailableDepartmentIds: [kayo],
      });
    });
  });

  it("rejects unknown, malformed and uppercase ids the same way as inactive ones", async () => {
    await rolledBack(db, async (tx) => {
      const hbcId = await idOf(tx, "hbc", "Jordan");
      await asApp(tx);
      const unknown = "00000000-0000-4000-8000-000000000000";
      expect(
        await checkUnitsForRegistration(tx, { hbcId: unknown, departmentIds: [unknown, "KAYO"] }),
      ).toEqual({ ok: false, hbcUnavailable: true, unavailableDepartmentIds: [unknown, "KAYO"] });
      expect(
        await checkUnitsForRegistration(tx, { hbcId, departmentIds: ["' OR 1=1 --"] }),
      ).toEqual({ ok: false, hbcUnavailable: false, unavailableDepartmentIds: ["' OR 1=1 --"] });
    });
  });
});
