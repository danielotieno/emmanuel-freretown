import { describe, expect, it } from "vitest";
import { compare, rowCounts, schemaSnapshot } from "../../scripts/db-drift";
import { connectTestDb } from "./db";

// The weekly drift check (issue #8). Each test runs in a transaction that is rolled back, so the
// deliberate drift below never outlives the test.

const db = connectTestDb();

describe("schemaSnapshot", () => {
  it("covers what the ORM cannot see: checks, grants, functions and migrations", async () => {
    const lines = await schemaSnapshot(db);
    expect(lines.some((l) => l.startsWith("constraint ") && l.includes("CHECK"))).toBe(true);
    expect(lines.some((l) => l.startsWith("grant ") && l.includes("app_runtime"))).toBe(true);
    expect(lines.some((l) => l.startsWith("function redact_expired_registration("))).toBe(true);
    expect(lines.some((l) => l.startsWith("migration 1 "))).toBe(true);
  });

  it("is identical when nothing has changed", async () => {
    expect(compare(await schemaSnapshot(db), await schemaSnapshot(db))).toEqual({
      missing: [],
      unexpected: [],
    });
  });

  it("detects a dropped CHECK constraint", async () => {
    const before = await schemaSnapshot(db);
    const { rows } = await db.query<{ name: string }>(
      `SELECT conname AS name FROM pg_constraint
        WHERE conrelid = 'member'::regclass AND contype = 'c' LIMIT 1`,
    );
    await db.query(`ALTER TABLE member DROP CONSTRAINT ${rows[0]!.name}`);
    const drift = compare(before, await schemaSnapshot(db));
    expect(drift.missing.some((l) => l.includes(rows[0]!.name))).toBe(true);
  });

  it("detects a privilege granted outside the migrations", async () => {
    const before = await schemaSnapshot(db);
    await db.query("GRANT DELETE ON audit_entry TO app_runtime");
    const drift = compare(before, await schemaSnapshot(db));
    expect(drift.unexpected).toContain("grant audit_entry app_runtime DELETE");
  });
});

describe("rowCounts", () => {
  it("reports a number per table and nothing else", async () => {
    const lines = await rowCounts(db);
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) expect(line).toMatch(/^rows [a-z_"]+ \d+$/);
  });
});
