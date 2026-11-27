import { describe, expect, it } from "vitest";
import type { Transaction } from "../../db";
import { SafeError } from "../observability";
import { recordAccess, write, writeMany, type AuditEntry } from "./write";

// Malformed entries are refused before any query. The database path is covered against real
// Postgres in tests/integration/audit.test.ts.
const untouchable = new Proxy(
  {},
  {
    get() {
      throw new Error("the database must not be touched");
    },
  },
) as Transaction;

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SafeError) return error.code;
    throw error;
  }
  return undefined;
}

const staff = { type: "STAFF", userId: "staff-1" } as const;
const ID = "0b6c3f9e-4d1a-4c2b-9f7e-2a5d8e1c3b40";

describe("write", () => {
  it("refuses an action whose prefix is not the entity type", async () => {
    const entry = {
      actor: staff,
      action: "member.approve",
      entityType: "registration",
      entityId: ID,
    } as unknown as AuditEntry;
    expect(await codeOf(write(untouchable, entry))).toBe("invalid_audit_entry");
  });

  it.each(["registration", "registration.", "Registration.Approve", "registration.approve now"])(
    "refuses the malformed action %j",
    async (action) => {
      const entry = { actor: staff, action, entityType: "registration", entityId: ID };
      expect(await codeOf(write(untouchable, entry as AuditEntry))).toBe("invalid_audit_entry");
    },
  );

  // Retention redaction matches entity_id = id::text exactly; anything else escapes it (BR-14).
  it.each(["", "REG-AVD2T", ID.toUpperCase(), "*", ` ${ID}`])(
    "refuses the registration entity id %j",
    async (entityId) => {
      const entry = {
        actor: staff,
        action: "registration.approve",
        entityType: "registration",
        entityId,
      } as const;
      expect(await codeOf(write(untouchable, entry))).toBe("invalid_audit_entry");
    },
  );

  it("accepts a staff user's text id but not an empty one or *", async () => {
    const entry = {
      actor: staff,
      action: "staff_user.reset_2fa",
      entityType: "staff_user",
    } as const;
    // Passing validation means reaching the database, which this fake refuses.
    await expect(write(untouchable, { ...entry, entityId: "kX9pQ2" })).rejects.toThrow(
      "the database must not be touched",
    );
    expect(await codeOf(write(untouchable, { ...entry, entityId: "" }))).toBe(
      "invalid_audit_entry",
    );
    expect(await codeOf(write(untouchable, { ...entry, entityId: "*" }))).toBe(
      "invalid_audit_entry",
    );
  });

  it("refuses an OTP code in before or after (issue #11)", async () => {
    const base = {
      actor: { type: "PUBLIC" },
      action: "registration.verify_phone",
      entityType: "registration",
      entityId: ID,
    } as const;
    expect(await codeOf(write(untouchable, { ...base, after: { otpCode: "482913" } }))).toBe(
      "audit_secret_value",
    );
    expect(await codeOf(write(untouchable, { ...base, before: { codeHash: "x" } }))).toBe(
      "audit_secret_value",
    );
  });
});

describe("writeMany", () => {
  it("writes nothing for no entries", async () => {
    expect(await codeOf(writeMany(untouchable, []))).toBeUndefined();
  });

  it("refuses every entry, before touching the database, if one is malformed", async () => {
    const good = {
      actor: staff,
      action: "member.create",
      entityType: "member",
      entityId: ID,
    } as const;
    const bad = { ...good, entityId: "REG-AVD2T" };
    expect(await codeOf(writeMany(untouchable, [good, bad]))).toBe("invalid_audit_entry");
  });
});

describe("recordAccess", () => {
  it.each([-1, 1.5, Number.NaN])("refuses the count %s", async (results) => {
    expect(
      await codeOf(
        recordAccess(untouchable, { actor: staff, kind: "search", entityType: "member", results }),
      ),
    ).toBe("invalid_audit_entry");
  });
});
