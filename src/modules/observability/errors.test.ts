import { describe, expect, it } from "vitest";
import { SafeError, safeErrorFields } from "./errors";

const PHONE = "+254712345678";

/** Shaped like a pg DatabaseError: pg names it "error"; the value is in `detail`. */
function pgError(code: string, constraint?: string) {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {
    name: "error",
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
    const fields = safeErrorFields(wrapped);

    expect(fields).toMatchObject({
      errorName: "Error",
      sqlState: "23505",
      constraint: "member_phone_uq",
      table: "member",
    });
    expect(fields.errorMessage).toBeUndefined();
    expect(JSON.stringify(fields)).not.toMatch(/712345678|Test Member|Failed query/);
  });

  it("reads the fields of our own safe database errors (sqlState, not code)", () => {
    const safe = Object.assign(
      new SafeError("database_error", "Database error on member.member_phone_uq"),
      {
        sqlState: "23505",
        constraint: "member_phone_uq",
        table: "member",
      },
    );
    expect(safeErrorFields(safe)).toMatchObject({
      errorCode: "database_error",
      sqlState: "23505",
      constraint: "member_phone_uq",
    });
  });

  it("does not mistake Node error codes for SQLSTATEs", () => {
    const pipe = Object.assign(new Error("write EPIPE"), { code: "EPIPE" });
    expect(safeErrorFields(pipe).sqlState).toBeUndefined();
  });

  it("keeps stack frames with line numbers but drops the message line of the stack", () => {
    const fields = safeErrorFields(new Error(`params: ${PHONE}`));
    expect(fields.stack).toMatch(/^at /);
    expect(fields.stack).not.toContain("712345678");
    expect(fields.stack).toMatch(/:\d+:\d+\)?$/m);
  });

  it("keeps the message of our own safe errors", () => {
    expect(safeErrorFields(new SafeError("not_found", "Registration not found"))).toMatchObject({
      errorName: "SafeError",
      errorCode: "not_found",
      errorMessage: "Registration not found",
    });
  });

  it("drops engine error messages, because they echo input", () => {
    let parseError: unknown;
    try {
      JSON.parse('{"fullName": Wanjiku Testperson}');
    } catch (error) {
      parseError = error;
    }
    const fields = safeErrorFields(parseError);
    expect(fields.errorName).toBe("SyntaxError");
    expect(JSON.stringify(fields)).not.toContain("Wanjiku");
  });

  it("drops the message of any other error", () => {
    expect(safeErrorFields(new Error("Test Member")).errorMessage).toBeUndefined();
  });

  it("keeps Next.js's numeric digest", () => {
    const error = Object.assign(new Error("x"), { digest: "2913872346" });
    expect(safeErrorFields(error).digest).toBe("2913872346");
    const odd = Object.assign(new Error("x"), { digest: `NEXT ${PHONE}` });
    expect(safeErrorFields(odd).digest).toBeUndefined();
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
