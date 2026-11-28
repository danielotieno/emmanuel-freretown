import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Transaction } from "../../src/db";
import {
  changeMemberStatus,
  editMemberDetails,
  listMembers,
  openMember,
  phoneBelongsToMember,
  searchMembers,
  transferMemberHbc,
  type MemberDetailsFields,
} from "../../src/modules/membership";
import { connectTestDrizzle, rolledBack } from "./db";

// Member records (issue #22, FR-6, D20, D31) against real Postgres, as app_runtime. Every
// person is synthetic; staff are made-up user ids. FWO numbers and phones start 22 so they
// can't meet another test file's.
//
// A test runs in one transaction, so `now()` is the same instant throughout it: members are
// made with periods that started a day earlier, so a transfer or a removal can end them now.

const db = connectTestDrizzle();
const ADMIN = { type: "STAFF", userId: "test-admin-22" } as const;

async function asApp(tx: Transaction) {
  await tx.execute(sql`SET LOCAL ROLE app_runtime`);
}

async function idOf(tx: Transaction, table: "hbc" | "department", name: string) {
  const { rows } = await tx.execute<{ id: string }>(
    sql`SELECT id FROM ${sql.identifier(table)} WHERE name = ${name}`,
  );
  return rows[0]!.id;
}

let counter = 0;

/** An ACTIVE member in Judea, in English Choir, with a phone unless `phone` is null. */
async function aMember(
  tx: Transaction,
  over: { fullName?: string; fwoNumber?: string; phone?: string | null; status?: string } = {},
) {
  counter++;
  const fwo = over.fwoNumber ?? `22${String(counter).padStart(4, "0")}`;
  const phone =
    over.phone === undefined ? `+2547002200${String(counter).padStart(2, "0")}` : over.phone;
  const status = over.status ?? "ACTIVE";
  const { rows } = await tx.execute<{ id: string }>(sql`
    INSERT INTO member (fwo_number, full_name, phone_e164, language, status, status_reason)
    VALUES (${fwo}, ${over.fullName ?? "Test Person"}, ${phone}, 'en', ${status},
            ${status === "ACTIVE" ? null : "Synthetic reason"})
    RETURNING id`);
  const id = rows[0]!.id;
  await tx.execute(sql`
    INSERT INTO member_hbc_assignment (member_id, hbc_id, valid_from)
    VALUES (${id}, ${await idOf(tx, "hbc", "Judea")}, now() - interval '1 day')`);
  await tx.execute(sql`
    INSERT INTO department_membership (member_id, department_id, state, valid_from)
    VALUES (${id}, ${await idOf(tx, "department", "English Choir")}, 'DECLARED',
            now() - interval '1 day')`);
  return id;
}

async function versionOf(tx: Transaction, id: string): Promise<number> {
  const { rows } = await tx.execute<{ version: number }>(
    sql`SELECT version FROM member WHERE id = ${id}`,
  );
  return rows[0]!.version;
}

async function memberRow(tx: Transaction, id: string) {
  const { rows } = await tx.execute(sql`SELECT * FROM member WHERE id = ${id}`);
  return rows[0]!;
}

async function auditOf(tx: Transaction, entityId: string) {
  const { rows } = await tx.execute<{
    action: string;
    actor_type: string;
    actor_id: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  }>(sql`
    SELECT action, actor_type, actor_id, before, after FROM audit_entry
     WHERE entity_type = 'member' AND entity_id = ${entityId} ORDER BY id`);
  return rows;
}

async function searchEntries(tx: Transaction) {
  const { rows } = await tx.execute<{ entity_id: string; after: Record<string, unknown> }>(sql`
    SELECT entity_id, after FROM audit_entry
     WHERE action = 'member.search' AND actor_id = ${ADMIN.userId} ORDER BY id`);
  return rows;
}

async function departmentPeriods(tx: Transaction, memberId: string) {
  const { rows } = await tx.execute<{ name: string; state: string; open: boolean }>(sql`
    SELECT d.name, m.state, m.valid_to IS NULL AS open
      FROM department_membership m JOIN department d ON d.id = m.department_id
     WHERE m.member_id = ${memberId} ORDER BY d.name, m.valid_from`);
  return rows;
}

const details = (over: Partial<MemberDetailsFields> = {}): MemberDetailsFields => ({
  fullName: "Test Person",
  noPersonalPhone: false,
  phone: "",
  language: "en",
  departmentIds: [],
  ...over,
});

describe("openMember (FR-6, D31)", () => {
  it("records member.view, then returns the record, its HBC history and departments", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await aMember(tx, { fullName: "Test Opened Person" });
      const record = await openMember(tx, { memberId: id, actor: ADMIN, requestId: "req-22" });
      expect(record).toMatchObject({
        id,
        fullName: "Test Opened Person",
        status: "ACTIVE",
        language: "en",
        importedAt: null,
        hbcId: await idOf(tx, "hbc", "Judea"),
        departments: [
          { departmentId: await idOf(tx, "department", "English Choir"), state: "DECLARED" },
        ],
      });
      expect(record!.hbcHistory).toHaveLength(1);
      expect(await auditOf(tx, id)).toEqual([
        {
          action: "member.view",
          actor_type: "STAFF",
          actor_id: ADMIN.userId,
          before: null,
          after: null,
        },
      ]);
    });
  });

  it("answers null for an unknown or malformed id, recording nothing", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const unknown = "00000000-0000-4000-8000-000000000022";
      expect(await openMember(tx, { memberId: unknown, actor: ADMIN })).toBeNull();
      expect(await openMember(tx, { memberId: "REG-ABCDE", actor: ADMIN })).toBeNull();
      expect(await auditOf(tx, unknown)).toEqual([]);
    });
  });
});

describe("listMembers (D31: a list page, not recorded)", () => {
  it("filters by HBC and status and records nothing", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const active = await aMember(tx, { fullName: "Test Listed Active" });
      const inactive = await aMember(tx, { fullName: "Test Listed Inactive", status: "INACTIVE" });
      const judea = await idOf(tx, "hbc", "Judea");

      const inJudea = await listMembers(tx, { hbcId: judea, status: "INACTIVE" }, 1000);
      expect(inJudea.items.map((m) => m.id)).toContain(inactive);
      expect(inJudea.items.map((m) => m.id)).not.toContain(active);
      expect(inJudea.items.find((m) => m.id === inactive)).toMatchObject({ hbcName: "Judea" });

      const elsewhere = await listMembers(tx, { hbcId: await idOf(tx, "hbc", "Samaria") }, 1000);
      expect(elsewhere.items.map((m) => m.id)).not.toContain(active);
      expect(await listMembers(tx, { hbcId: "not-a-uuid" })).toEqual({ items: [], total: 0 });
      expect(await auditOf(tx, active)).toEqual([]);
    });
  });
});

describe("searchMembers (D31: recorded with the number of results, never the terms)", () => {
  it("finds by exact FWO number, by phone in any Kenyan form, and by part of the name", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await aMember(tx, {
        fullName: "Test Wanjiru Searchable",
        fwoNumber: "220042",
        phone: "+254700229042",
      });
      const found = async (query: string) => {
        const result = await searchMembers(tx, { query, actor: ADMIN });
        return result.ok ? result.items.map((m) => m.id).includes(id) : "refused";
      };
      expect(await found("220042")).toBe(true);
      expect(await found("0220042")).toBe(true); // D61: leading zeros don't count
      expect(await found("2200420")).toBe(false);
      expect(await found("0700 229 042")).toBe(true);
      expect(await found("+254700229042")).toBe(true);
      expect(await found("wanjiru searCH")).toBe(true);
      expect(await found("%")).toBe("refused");
      expect(await found("Test%Searchable")).toBe(false); // % is a character, not a wildcard

      const entries = await searchEntries(tx);
      expect(entries).toHaveLength(7); // the refused one ran nothing and recorded nothing
      for (const entry of entries) {
        expect(entry.entity_id).toBe("*");
        expect(Object.keys(entry.after)).toEqual(["results"]);
      }
      expect(JSON.stringify(entries)).not.toMatch(/wanjiru|0220042|229042/i);
    });
  });
});

describe("searchMembers: how short a search may be", () => {
  it("accepts a one-digit FWO number (BR-01 has no length rule) but not one letter", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      expect((await searchMembers(tx, { query: "7", actor: ADMIN })).ok).toBe(true);
      expect(await searchMembers(tx, { query: "a", actor: ADMIN })).toEqual({
        ok: false,
        reason: "too_short",
      });
    });
  });
});

describe("editMemberDetails (FR-6: every edit needs a reason and is audited)", () => {
  it("changes the details, closes and opens department periods, and audits before and after", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await aMember(tx, { fullName: "Test Misspelt Person", phone: "+254700229101" });
      const choir = await idOf(tx, "department", "Kiswahili Choir");
      const result = await editMemberDetails(tx, {
        memberId: id,
        version: await versionOf(tx, id),
        fields: details({
          fullName: "Test Corrected Person",
          phone: "0700 229 102",
          language: "sw",
          departmentIds: [choir],
        }),
        reason: "Name misspelt on the parish list",
        actor: ADMIN,
        requestId: "req-22-edit",
      });
      expect(result).toEqual({ ok: true });
      expect(await memberRow(tx, id)).toMatchObject({
        full_name: "Test Corrected Person",
        phone_e164: "+254700229102",
        language: "sw",
        version: 1,
      });
      expect(await departmentPeriods(tx, id)).toEqual([
        { name: "English Choir", state: "DECLARED", open: false },
        { name: "Kiswahili Choir", state: "DECLARED", open: true },
      ]);
      const [entry] = await auditOf(tx, id);
      expect(entry).toMatchObject({
        action: "member.edit",
        actor_id: ADMIN.userId,
        before: {
          fullName: "Test Misspelt Person",
          phoneE164: "+254700229101",
          language: "en",
          departmentIds: [await idOf(tx, "department", "English Choir")],
        },
        after: {
          fullName: "Test Corrected Person",
          phoneE164: "+254700229102",
          language: "sw",
          departmentIds: [choir],
          reason: "Name misspelt on the parish list",
        },
      });
    });
  });

  it("records only what changed, and a member with no personal phone", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await aMember(tx, { phone: "+254700229111" });
      const english = await idOf(tx, "department", "English Choir");
      const result = await editMemberDetails(tx, {
        memberId: id,
        version: 0,
        fields: details({ noPersonalPhone: true, phone: "0700 229 111", departmentIds: [english] }),
        reason: "Shares the family phone (D28)",
        actor: ADMIN,
      });
      expect(result).toEqual({ ok: true });
      expect((await memberRow(tx, id)).phone_e164).toBeNull();
      const [entry] = await auditOf(tx, id);
      expect(entry!.before).toEqual({ phoneE164: "+254700229111" });
      expect(entry!.after).toEqual({ phoneE164: null, reason: "Shares the family phone (D28)" });
    });
  });

  it("refuses without a reason, with nothing changed, or with stale or wrong details", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await aMember(tx, { phone: "+254700229121" });
      const english = await idOf(tx, "department", "English Choir");
      const same = details({ phone: "0700229121", departmentIds: [english] });
      const edit = (over: Partial<Parameters<typeof editMemberDetails>[1]>) =>
        editMemberDetails(tx, {
          memberId: id,
          version: 0,
          fields: same,
          reason: "Synthetic reason",
          actor: ADMIN,
          ...over,
        });

      expect(await edit({ reason: " " })).toEqual({
        ok: false,
        reason: "invalid",
        errors: { reason: "required" },
      });
      expect(await edit({ fields: details({ fullName: "", phone: "123" }), reason: "" })).toEqual({
        ok: false,
        reason: "invalid",
        errors: { fullName: "required", phone: "invalid", reason: "required" },
      });
      expect(await edit({})).toEqual({ ok: false, reason: "unchanged" });
      expect(await edit({ version: 5, fields: { ...same, fullName: "Test Other" } })).toEqual({
        ok: false,
        reason: "stale",
      });
      expect(await edit({ memberId: "00000000-0000-4000-8000-000000000022" })).toEqual({
        ok: false,
        reason: "not_found",
      });
      expect(await memberRow(tx, id)).toMatchObject({ full_name: "Test Person", version: 0 });
      expect(await auditOf(tx, id)).toEqual([]);
    });
  });

  it("refuses a phone held by another active or inactive member (D20)", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      await aMember(tx, { phone: "+254700229131", status: "INACTIVE" });
      const id = await aMember(tx, { phone: "+254700229132" });
      const result = await editMemberDetails(tx, {
        memberId: id,
        version: 0,
        fields: details({ phone: "0700229131" }),
        reason: "New number",
        actor: ADMIN,
      });
      expect(result).toEqual({ ok: false, reason: "phone_held" });
      expect(await memberRow(tx, id)).toMatchObject({ phone_e164: "+254700229132", version: 0 });
      expect(await auditOf(tx, id)).toEqual([]);
    });
  });

  it("adds only active departments, but keeps one the member already has after it is deactivated", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await aMember(tx, { phone: "+254700229141" });
      const english = await idOf(tx, "department", "English Choir");
      const kayo = await idOf(tx, "department", "KAYO");
      await tx.execute(
        sql`UPDATE department SET is_active = false WHERE id IN (${english}, ${kayo})`,
      );

      const edit = (departmentIds: string[], fullName = "Test Person") =>
        editMemberDetails(tx, {
          memberId: id,
          version: 0,
          fields: details({ fullName, phone: "0700229141", departmentIds }),
          reason: "Synthetic reason",
          actor: ADMIN,
        });
      expect(await edit([english, kayo], "Test Renamed")).toEqual({ ok: false, reason: "units" });
      expect(await edit([english], "Test Renamed")).toEqual({ ok: true });
      expect(await departmentPeriods(tx, id)).toEqual([
        { name: "English Choir", state: "DECLARED", open: true },
      ]);
    });
  });
});

describe("changeMemberStatus (FR-6, domain-model.md §3)", () => {
  it("moves along the lifecycle with a reason, kept on the record and audited", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await aMember(tx, { phone: "+254700229201" });
      const change = async (status: string, reason: string) =>
        changeMemberStatus(tx, {
          memberId: id,
          version: await versionOf(tx, id),
          status,
          reason,
          actor: ADMIN,
        });
      expect(await change("INACTIVE", "Moved away for work")).toEqual({ ok: true });
      expect(await memberRow(tx, id)).toMatchObject({
        status: "INACTIVE",
        status_reason: "Moved away for work",
      });
      expect(await change("INACTIVE", "Again")).toEqual({ ok: false, reason: "unchanged" });
      expect(await change("ACTIVE", "Back in the parish")).toEqual({ ok: true });
      expect(await change("MISSING", "Synthetic")).toEqual({
        ok: false,
        reason: "invalid",
        errors: { status: "required" },
      });
      expect(await change("ACTIVE", "")).toMatchObject({ reason: "invalid" });
      expect((await auditOf(tx, id)).map((e) => [e.action, e.before, e.after])).toEqual([
        [
          "member.change_status",
          { status: "ACTIVE" },
          { status: "INACTIVE", reason: "Moved away for work" },
        ],
        [
          "member.change_status",
          { status: "INACTIVE" },
          { status: "ACTIVE", reason: "Back in the parish" },
        ],
      ]);
    });
  });

  for (const status of ["DECEASED", "TRANSFERRED_OUT"]) {
    it(`${status} releases the phone number for another member (D20) and closes the record`, async () => {
      await rolledBack(db, async (tx) => {
        await asApp(tx);
        const phone = "+254700229211";
        const id = await aMember(tx, { phone });
        const other = await aMember(tx, { phone: "+254700229212" });
        expect(
          await changeMemberStatus(tx, {
            memberId: id,
            version: 0,
            status,
            reason: "Recorded by the Church Secretary",
            actor: ADMIN,
          }),
        ).toEqual({ ok: false, reason: "invalid", errors: { confirmFinal: "required" } });
        expect(
          await changeMemberStatus(tx, {
            memberId: id,
            version: 0,
            status,
            reason: "Recorded by the Church Secretary",
            confirmFinal: true,
            actor: ADMIN,
          }),
        ).toEqual({ ok: true });

        // The number is free: no registration is flagged for it, and another member can take it.
        expect(await phoneBelongsToMember(tx, phone)).toBe(false);
        expect(
          await editMemberDetails(tx, {
            memberId: other,
            version: 0,
            fields: details({
              phone: "0700229211",
              departmentIds: [await idOf(tx, "department", "English Choir")],
            }),
            reason: "Inherited the phone",
            actor: ADMIN,
          }),
        ).toEqual({ ok: true });

        // Closed: nothing about the record changes any more.
        const version = await versionOf(tx, id);
        const base = { memberId: id, version, reason: "Synthetic reason", actor: ADMIN };
        expect(await changeMemberStatus(tx, { ...base, status: "ACTIVE" })).toEqual({
          ok: false,
          reason: "closed",
        });
        expect(
          await editMemberDetails(tx, {
            ...base,
            fields: details({ fullName: "Test Changed", noPersonalPhone: true }),
          }),
        ).toEqual({ ok: false, reason: "closed" });
        expect(
          await transferMemberHbc(tx, { ...base, hbcId: await idOf(tx, "hbc", "Samaria") }),
        ).toEqual({ ok: false, reason: "closed" });
        expect(await memberRow(tx, id)).toMatchObject({ status, phone_e164: phone });
      });
    });
  }
});

describe("transferMemberHbc (FR-6, BR-04, ADR 0003)", () => {
  it("closes the open period and opens the new one at the same instant, audited", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await aMember(tx, { phone: "+254700229301" });
      const judea = await idOf(tx, "hbc", "Judea");
      const samaria = await idOf(tx, "hbc", "Samaria");
      expect(
        await transferMemberHbc(tx, {
          memberId: id,
          version: 0,
          hbcId: samaria,
          reason: "Moved house",
          actor: ADMIN,
        }),
      ).toEqual({ ok: true });

      const { rows } = await tx.execute<{
        hbc_id: string;
        closed_at_new_start: boolean | null;
      }>(sql`
        SELECT a.hbc_id,
               a.valid_to = (SELECT b.valid_from FROM member_hbc_assignment b
                              WHERE b.member_id = a.member_id AND b.valid_to IS NULL)
                 AS closed_at_new_start
          FROM member_hbc_assignment a WHERE a.member_id = ${id} ORDER BY a.valid_from`);
      expect(rows).toEqual([
        { hbc_id: judea, closed_at_new_start: true },
        { hbc_id: samaria, closed_at_new_start: null },
      ]);
      expect(await versionOf(tx, id)).toBe(1);
      const record = await openMember(tx, { memberId: id, actor: ADMIN });
      expect(record!.hbcId).toBe(samaria);
      expect(record!.hbcHistory.map((p) => p.hbcId)).toEqual([samaria, judea]);
      expect((await auditOf(tx, id))[0]).toMatchObject({
        action: "member.transfer_hbc",
        before: { hbcId: judea },
        after: { hbcId: samaria, reason: "Moved house" },
      });
    });
  });

  it("refuses the same HBC, an inactive one, a stale version or no reason", async () => {
    await rolledBack(db, async (tx) => {
      await asApp(tx);
      const id = await aMember(tx, { phone: "+254700229311" });
      const samaria = await idOf(tx, "hbc", "Samaria");
      const transfer = (over: Partial<Parameters<typeof transferMemberHbc>[1]>) =>
        transferMemberHbc(tx, {
          memberId: id,
          version: 0,
          hbcId: samaria,
          reason: "Moved house",
          actor: ADMIN,
          ...over,
        });
      expect(await transfer({ hbcId: await idOf(tx, "hbc", "Judea") })).toEqual({
        ok: false,
        reason: "unchanged",
      });
      expect(await transfer({ version: 3 })).toEqual({ ok: false, reason: "stale" });
      expect(await transfer({ hbcId: "", reason: "" })).toEqual({
        ok: false,
        reason: "invalid",
        errors: { hbcId: "required", reason: "required" },
      });
      await tx.execute(sql`UPDATE hbc SET is_active = false WHERE id = ${samaria}`);
      expect(await transfer({})).toEqual({ ok: false, reason: "units" });
      expect(await auditOf(tx, id)).toEqual([]);
    });
  });
});
