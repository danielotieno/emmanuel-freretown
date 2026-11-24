import { describe, expect, it } from "vitest";
import { SafeError, safeErrorFields } from "./errors";

const PHONE = "+254712345678";

/** Shaped like a pg DatabaseError: the value is in `detail`, and sometimes in the message. */
function pgError(code: string, constraint?: string) {
  return Object.assign(new Error(`duplicate key value violates unique constraint`), {
    name: "DatabaseError",
    code,
    constraint,
    table: "member",
    detail: `Key (phone_e164)=(${PHONE}) already exists.`,
  });
}

describe("safeErrorFields", () => {
  it("keeps the SQLSTATE, constraint and table from a wrapped Postgres error, and nothing else", () => {
    const wrapped = new Error(`Failed query: insert ...\nparams: Test Member,${PHONE}`, {
      cause: pgError("23505", "member_phone_uq"),
    });
    wrapped.name = "DrizzleQueryError";
    const fields = safeErrorFields(wrapped);

    expect(fields).toMatchObject({
      errorName: "DrizzleQueryError",
      sqlState: "23505",
      constraint: "member_phone_uq",
      table: "member",
    });
    expect(fields.errorMessage).toBeUndefined();
    const json = JSON.stringify(fields);
    expect(json).not.toContain("712345678");
    expect(json).not.toContain("Test Member");
    expect(json).not.toContain("Failed query");
  });

  it("keeps stack frames but drops the message line of the stack", () => {
    const error = new Error(`params: ${PHONE}`);
    const fields = safeErrorFields(error);
    expect(fields.stack).toMatch(/^at /);
    expect(fields.stack).not.toContain("712345678");
    // Line and column numbers survive.
    expect(fields.stack).toMatch(/:\d+:\d+\)?$/m);
  });

  it("keeps the message of our own safe errors", () => {
    expect(safeErrorFields(new SafeError("not_found", "Registration not found"))).toMatchObject({
      errorName: "SafeError",
      errorCode: "not_found",
      errorMessage: "Registration not found",
    });
  });

  it("keeps engine error messages, scrubbed", () => {
    const fields = safeErrorFields(new TypeError(`x.trim is not a function for ${PHONE}`));
    expect(fields.errorMessage).toBe("x.trim is not a function for [redacted]");
  });

  it("drops the message of any other error", () => {
    expect(safeErrorFields(new Error("Test Member")).errorMessage).toBeUndefined();
  });

  it("describes non-errors by type only", () => {
    expect(safeErrorFields(PHONE)).toEqual({ errorName: "string" });
    expect(safeErrorFields({ phone: PHONE })).toEqual({ errorName: "NonError" });
  });

  it("ignores codes and names that are not identifiers", () => {
    const odd = Object.assign(new Error("x"), { code: PHONE, constraint: "a b" });
    odd.name = `Bad ${PHONE}`;
    expect(safeErrorFields(odd)).toEqual({ errorName: "Error", stack: expect.any(String) });
  });
});
