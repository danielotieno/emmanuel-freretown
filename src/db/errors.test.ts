import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { isUniqueViolation, safeQuery, SafeDatabaseError, toSafeDatabaseError } from "./errors";

const PHONE = "+254712345678";

function pgError(code: string, constraint?: string) {
  return Object.assign(new Error("duplicate key value violates unique constraint"), {
    name: "DatabaseError",
    code,
    constraint,
    table: "member",
    detail: `Key (phone_e164)=(${PHONE}) already exists.`,
  });
}

function drizzleError(code: string, constraint?: string) {
  return new DrizzleQueryError(
    'insert into "member" ("full_name", "phone_e164") values ($1, $2)',
    ["Test Member", PHONE],
    pgError(code, constraint),
  );
}

describe("toSafeDatabaseError", () => {
  it("maps a unique violation to a safe error with no cause, message or params", () => {
    const safe = toSafeDatabaseError(drizzleError("23505", "member_phone_uq"));
    expect(safe).toBeInstanceOf(SafeDatabaseError);
    expect(safe).toMatchObject({
      kind: "unique_violation",
      sqlState: "23505",
      constraint: "member_phone_uq",
      table: "member",
      message: "Database unique_violation on member.member_phone_uq",
    });
    const error = safe as SafeDatabaseError;
    expect(error.cause).toBeUndefined();
    const everything = JSON.stringify({ ...error, message: error.message, stack: error.stack });
    expect(everything).not.toMatch(/712345678|Test Member/);
  });

  it.each([
    ["23514", "check_violation"],
    ["23503", "foreign_key_violation"],
    ["23P01", "exclusion_violation"],
    ["P0001", "raise_exception"],
    ["40001", "serialization_failure"],
    ["08006", "unavailable"],
    ["22P02", "unknown"],
  ])("maps SQLSTATE %s to %s", (code, kind) => {
    expect(toSafeDatabaseError(drizzleError(code))).toMatchObject({ kind, sqlState: code });
  });

  it("maps connection failures to unavailable", () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:5432"), {
      code: "ECONNREFUSED",
    });
    expect(toSafeDatabaseError(refused)).toMatchObject({ kind: "unavailable" });
  });

  it("leaves other errors alone", () => {
    const other = new TypeError("x is not a function");
    expect(toSafeDatabaseError(other)).toBe(other);
  });
});

describe("safeQuery", () => {
  it("rethrows database failures as safe errors", async () => {
    const failure = safeQuery(() => Promise.reject(drizzleError("23505", "member_phone_uq")));
    await expect(failure).rejects.toBeInstanceOf(SafeDatabaseError);
    const error = await failure.catch((e: unknown) => e);
    expect(isUniqueViolation(error, "member_phone_uq")).toBe(true);
    expect(isUniqueViolation(error, "member_fwo_uq")).toBe(false);
  });

  it("returns the result on success", async () => {
    await expect(safeQuery(async () => 42)).resolves.toBe(42);
  });
});
