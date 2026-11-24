import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import type { DbOrTx } from "../../db";
import { redactExpiredRegistrations } from "./retention";

// The failure path can't be tested inside the integration tests' rolled-back transaction (one
// failure aborts it), so this fakes the two queries: the select of due registrations, then one
// call of redact_expired_registration per id. The real queries are covered in
// tests/integration/jobs.test.ts.
function fakeDb(ids: string[], failing: Set<string>) {
  const called: string[] = [];
  let first = true;
  const db = {
    execute: async (query: { queryChunks?: unknown[] }) => {
      if (first) {
        first = false;
        return { rows: ids.map((id) => ({ id })) };
      }
      const id = (query.queryChunks ?? []).find(
        (chunk): chunk is string => typeof chunk === "string" && ids.includes(chunk),
      )!;
      called.push(id);
      if (failing.has(id)) {
        const pg = Object.assign(new Error("not eligible"), { name: "error", code: "P0001" });
        throw new DrizzleQueryError("select public.redact_expired_registration($1)", [id], pg);
      }
      return { rows: [] };
    },
  };
  return { db: db as unknown as DbOrTx, called };
}

describe("redactExpiredRegistrations", () => {
  it("keeps going after one redaction fails, and reports the first failure's SQLSTATE", async () => {
    const { db, called } = fakeDb(["a", "b", "c"], new Set(["b"]));
    expect(await redactExpiredRegistrations(db)).toEqual({
      redacted: 2,
      failed: 1,
      firstFailure: "P0001",
    });
    expect(called).toEqual(["a", "b", "c"]);
  });

  it("reports nothing when every redaction succeeds", async () => {
    const { db } = fakeDb(["a"], new Set());
    expect(await redactExpiredRegistrations(db)).toEqual({ redacted: 1, failed: 0 });
  });
});
