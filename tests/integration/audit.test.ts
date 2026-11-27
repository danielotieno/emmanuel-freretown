import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { SafeDatabaseError, type Transaction } from "../../src/db";
import * as audit from "../../src/modules/audit";
import { SafeError } from "../../src/modules/observability";
import { connectTestDrizzle, PG, rolledBack } from "./db";

// The audit module (issue #11, CLAUDE.md rule 4, BR-12, FR-11) against real Postgres. Writes
// run as app_runtime, so the column grants on audit_entry are exercised too: the application
// may append entries but cannot set their time or mark them redacted.

const db = connectTestDrizzle();

const staff = { type: "STAFF", userId: "staff-audit-1" } as const;

// Entity ids are uuids, as in the tables. ENTITY is used under two entity types on purpose:
// entries are told apart by entity type, not by id alone.
const ENTITY = randomUUID();
const HBC_A = randomUUID();
const HBC_B = randomUUID();
const HBC_C = randomUUID();
const REGISTRATION = randomUUID();
const MEMBER = randomUUID();

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

type Row = {
  actor_type: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  request_id: string | null;
  redacted_at: Date | null;
  recent: boolean;
};

async function entriesFor(tx: Transaction, entityId: string): Promise<Row[]> {
  const { rows } = await tx.execute<Row>(sql`
    SELECT actor_type, actor_id, action, entity_type, entity_id, before, after, request_id,
           redacted_at, at > now() - interval '1 minute' AS recent
      FROM audit_entry WHERE entity_id = ${entityId} ORDER BY id`);
  return rows;
}

describe("audit.write", () => {
  it("appends an entry as app_runtime, timed by the database", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await audit.write(tx, {
        actor: staff,
        action: "member.transfer_hbc",
        entityType: "member",
        entityId: ENTITY,
        ...audit.changes(
          { hbcId: "hbc-a", status: "ACTIVE" },
          { hbcId: "hbc-b", status: "ACTIVE" },
        ),
        requestId: "req-1",
      });
      await audit.write(tx, {
        actor: { type: "PUBLIC" },
        action: "registration.submit",
        entityType: "registration",
        entityId: ENTITY,
      });

      expect(await entriesFor(tx, ENTITY)).toEqual([
        {
          actor_type: "STAFF",
          actor_id: "staff-audit-1",
          action: "member.transfer_hbc",
          entity_type: "member",
          entity_id: ENTITY,
          before: { hbcId: "hbc-a" },
          after: { hbcId: "hbc-b" },
          request_id: "req-1",
          redacted_at: null,
          recent: true,
        },
        {
          actor_type: "PUBLIC",
          actor_id: null,
          action: "registration.submit",
          entity_type: "registration",
          entity_id: ENTITY,
          before: null,
          after: null,
          request_id: null,
          redacted_at: null,
          recent: true,
        },
      ]);
    });
  });

  it("rolls back with the state change it records (rule 4)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const failed = tx.transaction(async (inner) => {
        await inner.execute(sql`INSERT INTO hbc (name, sort_order) VALUES ('Audit Test A', 90)`);
        await audit.write(inner, {
          actor: staff,
          action: "hbc.create",
          entityType: "hbc",
          entityId: HBC_A,
        });
        throw new Error("the state change failed after the entry was written");
      });
      await expect(failed).rejects.toThrow("the state change failed");

      await tx.transaction(async (inner) => {
        await inner.execute(sql`INSERT INTO hbc (name, sort_order) VALUES ('Audit Test B', 91)`);
        await audit.write(inner, {
          actor: staff,
          action: "hbc.create",
          entityType: "hbc",
          entityId: HBC_B,
        });
      });

      expect(await entriesFor(tx, HBC_A)).toEqual([]);
      expect(await entriesFor(tx, HBC_B)).toHaveLength(1);
    });
  });

  it("undoes the state change when the entry cannot be written, with a safe error", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const failed = tx.transaction(async (inner) => {
        await inner.execute(sql`INSERT INTO hbc (name, sort_order) VALUES ('Audit Test C', 92)`);
        await audit.write(inner, {
          // Bypasses the types; the database's CHECK refuses it.
          actor: { type: "ROBOT" } as unknown as audit.Actor,
          action: "hbc.create",
          entityType: "hbc",
          entityId: HBC_C,
        });
      });
      const error = await failed.catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SafeDatabaseError);
      expect((error as SafeDatabaseError).sqlState).toBe(PG.checkViolation);

      const { rows } = await tx.execute(sql`SELECT 1 FROM hbc WHERE name = 'Audit Test C'`);
      expect(rows).toEqual([]);
      expect(await entriesFor(tx, HBC_C)).toEqual([]);
    });
  });

  it("writes nothing when the values hold an OTP code", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const error = await audit
        .write(tx, {
          actor: { type: "PUBLIC" },
          action: "registration.verify_phone",
          entityType: "registration",
          entityId: REGISTRATION,
          after: { phoneVerified: true, otp: "482913" },
        })
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(SafeError);
      expect((error as SafeError).code).toBe("audit_secret_value");
      expect(await entriesFor(tx, REGISTRATION)).toEqual([]);
    });
  });
});

describe("registration entries and retention redaction (BR-14)", () => {
  it("redacts every entry about a registration, revisions, evidence and decisions included", async () => {
    await rolledBack(db, async (tx) => {
      // Setup as the owner: a registration rejected 13 months ago. The guard trigger forbids
      // backdating, rightly; switch it off for setup only.
      await tx.execute(sql`ALTER TABLE registration DISABLE TRIGGER registration_guard`);
      const { rows } = await tx.execute<{ id: string }>(sql`
        INSERT INTO registration (reference, channel, language, status, decided_at)
        VALUES ('REG-AVD2T', 'SELF', 'en', 'REJECTED', now() - interval '13 months')
        RETURNING id`);
      await tx.execute(sql`ALTER TABLE registration ENABLE TRIGGER registration_guard`);
      const id = rows[0]!.id;
      await tx.execute(sql`
        INSERT INTO registration_decision (registration_id, action, reason, actor_user_id, at)
        VALUES (${id}, 'REJECT', 'Test', 'staff-audit-1', now() - interval '13 months')`);

      await asApp(tx);
      const about = { entityType: "registration", entityId: id } as const;
      await audit.write(tx, {
        ...about,
        actor: { type: "PUBLIC" },
        action: "registration.submit",
        after: { fullName: "Test Person", fwoNumber: "8100", phoneE164: "+254700000010" },
      });
      await audit.write(tx, {
        ...about,
        actor: { type: "PUBLIC" },
        action: "registration.verify_phone",
        after: { evidence: "PHONE_OTP" },
      });
      await audit.write(tx, {
        ...about,
        actor: staff,
        action: "registration.revise",
        ...audit.changes({ fullName: "Test Person" }, { fullName: "Test M Person" }),
      });
      await audit.write(tx, {
        ...about,
        actor: staff,
        action: "registration.reject",
        after: { status: "REJECTED", reason: "Test" },
      });
      await audit.recordAccess(tx, { ...about, actor: staff, kind: "view" });

      await tx.execute(sql`SELECT public.redact_expired_registration(${id})`);

      const entries = await entriesFor(tx, id);
      expect(entries.map((e) => e.action)).toEqual([
        "registration.submit",
        "registration.verify_phone",
        "registration.revise",
        "registration.reject",
        "registration.view",
        "registration.redact",
      ]);
      for (const entry of entries) {
        expect(entry).toMatchObject({ entity_type: "registration", before: null, after: null });
      }
      expect(entries.slice(0, -1).every((e) => e.redacted_at !== null)).toBe(true);
    });
  });
});

describe("audit.recordAccess (BR-12, D31)", () => {
  it("records opening a record, a search's result count and an export's row count", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await audit.recordAccess(tx, {
        actor: staff,
        kind: "view",
        entityType: "member",
        entityId: MEMBER,
        requestId: "req-2",
      });
      await audit.recordAccess(tx, {
        actor: staff,
        kind: "search",
        entityType: "member",
        results: 3,
      });
      await audit.recordAccess(tx, {
        actor: staff,
        kind: "export",
        entityType: "member",
        rows: 412,
      });

      const view = await entriesFor(tx, MEMBER);
      expect(view).toMatchObject([
        {
          actor_type: "STAFF",
          actor_id: "staff-audit-1",
          action: "member.view",
          entity_type: "member",
          before: null,
          after: null,
          request_id: "req-2",
        },
      ]);

      const collection = await entriesFor(tx, "*");
      expect(
        collection.map(({ action, entity_type, before, after }) => ({
          action,
          entity_type,
          before,
          after,
        })),
      ).toEqual([
        { action: "member.search", entity_type: "member", before: null, after: { results: 3 } },
        { action: "member.export", entity_type: "member", before: null, after: { rows: 412 } },
      ]);
    });
  });
});

describe("audit.readTrail and audit.readLog (FR-11, #24)", () => {
  const edit = {
    actor: staff,
    action: "member.edit",
    entityType: "member",
    entityId: MEMBER,
    ...audit.changes({ fullName: "Test Person" }, { fullName: "Test M Person" }),
    after: { fullName: "Test M Person", reason: "Misspelt" },
  } as const;

  it("reads one record's trail, newest first, with its values", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await audit.write(tx, edit);
      await audit.recordAccess(tx, {
        actor: staff,
        kind: "view",
        entityType: "member",
        entityId: MEMBER,
      });
      // The same id under another entity type is another record's trail.
      await audit.write(tx, { ...edit, action: "registration.reject", entityType: "registration" });

      const { entries, next } = await audit.readTrail(tx, {
        entityType: "member",
        entityId: MEMBER,
      });
      expect(next).toBeNull();
      expect(entries).toMatchObject([
        { action: "member.view", actor: staff, before: null, after: null, withheld: false },
        {
          action: "member.edit",
          actor: staff,
          entityType: "member",
          entityId: MEMBER,
          before: { fullName: "Test Person" },
          after: { fullName: "Test M Person", reason: "Misspelt" },
          redactedAt: null,
          withheld: false,
        },
      ]);
      expect(entries[0]!.at).toBeInstanceOf(Date);
      expect(entries[0]!.id).toBeGreaterThan(entries[1]!.id);
    });
  });

  it("pages through a long trail, newest first, so no entry is out of reach", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await audit.writeMany(
        tx,
        Array.from({ length: audit.AUDIT_PAGE + 1 }, (_, i) => ({ ...edit, after: { n: i } })),
      );
      const member = { entityType: "member", entityId: MEMBER } as const;
      const first = await audit.readTrail(tx, member);
      expect(first.entries).toHaveLength(audit.AUDIT_PAGE);
      expect(first.entries[0]!.after).toEqual({ n: audit.AUDIT_PAGE });
      expect(first.next).toBe(first.entries.at(-1)!.id);

      const second = await audit.readTrail(tx, member, { before: first.next! });
      expect(second.entries.map((e) => e.after)).toEqual([{ n: 0 }]);
      expect(second.next).toBeNull();
    });
  });

  it("reads nothing for an id that isn't a uuid", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      expect(await audit.readTrail(tx, { entityType: "member", entityId: "*" })).toEqual({
        entries: [],
        next: null,
      });
    });
  });

  it("withholds the values of registration and member entries from the full log (D31)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await audit.write(tx, edit);
      await audit.write(tx, {
        actor: staff,
        action: "registration.reject",
        entityType: "registration",
        entityId: REGISTRATION,
        after: { status: "REJECTED", reason: "Duplicate" },
      });
      await audit.recordAccess(tx, {
        actor: staff,
        kind: "search",
        entityType: "member",
        results: 2,
      });
      await audit.write(tx, {
        actor: staff,
        action: "hbc.rename",
        entityType: "hbc",
        entityId: HBC_A,
        ...audit.changes({ name: "Judea" }, { name: "Judaea" }),
      });
      // Opening a record holds no values: nothing to withhold.
      await audit.recordAccess(tx, {
        actor: staff,
        kind: "view",
        entityType: "member",
        entityId: MEMBER,
      });

      const { entries } = await audit.readLog(tx);
      expect(entries.slice(0, 5)).toMatchObject([
        { action: "member.view", entityId: MEMBER, before: null, after: null, withheld: false },
        {
          action: "hbc.rename",
          before: { name: "Judea" },
          after: { name: "Judaea" },
          withheld: false,
        },
        { action: "member.search", entityId: "*", after: { results: 2 }, withheld: false },
        { action: "registration.reject", before: null, after: null, withheld: true },
        { action: "member.edit", entityId: MEMBER, before: null, after: null, withheld: true },
      ]);
    });
  });

  it("withholds the values of any entity type not known to be free of member data", async () => {
    await rolledBack(db, async (tx) => {
      // As the owner: no module writes this type yet, as a Release 2 one might.
      await tx.execute(sql`
        INSERT INTO audit_entry (actor_type, action, entity_type, entity_id, after)
        VALUES ('SYSTEM', 'candidate.nominate', 'candidate', ${ENTITY}, '{"fullName": "Test Person"}')`);
      await asApp(tx);
      const { entries } = await audit.readLog(tx);
      expect(entries[0]).toMatchObject({
        action: "candidate.nominate",
        before: null,
        after: null,
        withheld: true,
      });
    });
  });

  it("pages through the full log, newest first", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await audit.writeMany(
        tx,
        Array.from({ length: audit.AUDIT_PAGE + 1 }, (_, i) => ({
          actor: staff,
          action: "hbc.rename" as const,
          entityType: "hbc" as const,
          entityId: HBC_B,
          after: { n: i },
        })),
      );

      const first = await audit.readLog(tx);
      expect(first.entries).toHaveLength(audit.AUDIT_PAGE);
      expect(first.entries.map((e) => e.after)).toEqual(
        Array.from({ length: audit.AUDIT_PAGE }, (_, i) => ({ n: audit.AUDIT_PAGE - i })),
      );
      expect(first.next).toBe(first.entries.at(-1)!.id);

      const second = await audit.readLog(tx, { before: first.next! });
      expect(second.entries[0]).toMatchObject({ entityId: HBC_B, after: { n: 0 } });
    });
  });
});
