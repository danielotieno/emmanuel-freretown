import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import { randomUUID } from "node:crypto";
import {
  addUnit,
  checkUnitsForRegistration,
  listActiveDepartments,
  listActiveHbcs,
  listUnits,
  moveUnit,
  renameUnit,
  setUnitActive,
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

describe("unit administration (FR-9, #23)", () => {
  const actor = { type: "STAFF", userId: "test-admin-23" } as const;

  async function entries(tx: Transaction, entityId: string) {
    const { rows } = await tx.execute<{ action: string; before: unknown; after: unknown }>(sql`
      SELECT action, before, after FROM audit_entry
       WHERE entity_id = ${entityId} AND actor_id = 'test-admin-23' ORDER BY id`);
    return rows;
  }

  it("adds a unit at the end of the list, active, and audits it", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const result = await addUnit(tx, { kind: "department", name: "  Youth   Choir ", actor });
      expect(result).toEqual({ ok: true });
      const units = await listUnits(tx, "department");
      const added = units.at(-1)!;
      expect(added).toMatchObject({ name: "Youth Choir", isActive: true, sortOrder: 9 });
      expect((await listActiveDepartments(tx)).at(-1)!.name).toBe("Youth Choir");
      expect(await entries(tx, added.id)).toEqual([
        { action: "department.create", before: null, after: { name: "Youth Choir", sortOrder: 9 } },
      ]);
    });
  });

  it("refuses a name another unit of the kind has, ignoring case, spaces and curly quotes", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      for (const name of ["mother’s  UNION", "kayo"]) {
        expect(await addUnit(tx, { kind: "department", name, actor })).toEqual({
          ok: false,
          reason: "name_taken",
        });
      }
      // The same name is fine for the other kind.
      expect(await addUnit(tx, { kind: "hbc", name: "KAYO", actor })).toEqual({ ok: true });
      expect(await addUnit(tx, { kind: "hbc", name: "J", actor })).toEqual({
        ok: false,
        reason: "invalid",
        error: "too_short",
      });
    });
  });

  it("renames a unit, keeping its id, and audits the old and new names", async () => {
    await rolledBack(db, async (tx) => {
      const id = await idOf(tx, "department", "KAYO");
      await asApp(tx);
      expect(await renameUnit(tx, { kind: "department", id, name: "KAYO Youth", actor })).toEqual({
        ok: true,
      });
      expect((await listUnits(tx, "department")).find((u) => u.id === id)!.name).toBe("KAYO Youth");
      expect(await entries(tx, id)).toEqual([
        { action: "department.rename", before: { name: "KAYO" }, after: { name: "KAYO Youth" } },
      ]);
      // Its own name in other capitals is not "taken"; another unit's name is.
      expect(await renameUnit(tx, { kind: "department", id, name: "Kayo Youth", actor })).toEqual({
        ok: true,
      });
      expect(
        await renameUnit(tx, { kind: "department", id, name: "english choir", actor }),
      ).toEqual({ ok: false, reason: "name_taken" });
      expect(await renameUnit(tx, { kind: "department", id, name: "Kayo Youth", actor })).toEqual({
        ok: false,
        reason: "unchanged",
      });
      expect(
        await renameUnit(tx, { kind: "department", id: randomUUID(), name: "Other", actor }),
      ).toEqual({ ok: false, reason: "not_found" });
    });
  });

  it("moves a unit up or down, numbering the list again and auditing each unit moved", async () => {
    await rolledBack(db, async (tx) => {
      const judea = await idOf(tx, "hbc", "Judea");
      const jordan = await idOf(tx, "hbc", "Jordan");
      await asApp(tx);
      expect(await moveUnit(tx, { kind: "hbc", id: judea, direction: "up", actor })).toEqual({
        ok: true,
      });
      expect((await listActiveHbcs(tx)).slice(0, 2).map((u) => u.name)).toEqual([
        "Judea",
        "Jordan",
      ]);
      expect(await entries(tx, judea)).toEqual([
        { action: "hbc.reorder", before: { sortOrder: 2 }, after: { sortOrder: 1 } },
      ]);
      expect(await entries(tx, jordan)).toEqual([
        { action: "hbc.reorder", before: { sortOrder: 1 }, after: { sortOrder: 2 } },
      ]);
      // Already first: nothing to do.
      expect(await moveUnit(tx, { kind: "hbc", id: judea, direction: "up", actor })).toEqual({
        ok: false,
        reason: "unchanged",
      });
    });
  });

  it("deactivates and reactivates a unit, auditing each, never the last active HBC", async () => {
    await rolledBack(db, async (tx) => {
      const evangelism = await idOf(tx, "department", "Evangelism");
      await asApp(tx);
      const off = { kind: "department", id: evangelism, active: false, actor } as const;
      expect(await setUnitActive(tx, off)).toEqual({ ok: true });
      expect((await listActiveDepartments(tx)).map((u) => u.name)).not.toContain("Evangelism");
      expect(await setUnitActive(tx, off)).toEqual({ ok: false, reason: "unchanged" });
      expect(await setUnitActive(tx, { ...off, active: true })).toEqual({ ok: true });
      expect(await entries(tx, evangelism)).toEqual([
        { action: "department.deactivate", before: { isActive: true }, after: { isActive: false } },
        { action: "department.activate", before: { isActive: false }, after: { isActive: true } },
      ]);

      const hbcs = await listUnits(tx, "hbc");
      for (const unit of hbcs.slice(1)) {
        expect(await setUnitActive(tx, { kind: "hbc", id: unit.id, active: false, actor })).toEqual(
          { ok: true },
        );
      }
      expect(
        await setUnitActive(tx, { kind: "hbc", id: hbcs[0]!.id, active: false, actor }),
      ).toEqual({ ok: false, reason: "last_active_hbc" });
    });
  });
});
