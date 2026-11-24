import { DrizzleQueryError } from "drizzle-orm/errors";
import { describe, expect, it } from "vitest";
import { isUniqueViolation, safeQuery, SafeDatabaseError, toSafeDatabaseError } from "./errors";

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

/** A real DrizzleQueryError, as Drizzle 0.45 throws it (its name stays "Error"). */
function drizzleError(cause: Error) {
  return new DrizzleQueryError(
    'insert into "member" ("full_name", "phone_e164") values ($1, $2)',
    ["Test Member", PHONE],
    cause,
  );
}

function everything(error: unknown) {
  const e = error as Error;
  return `${e.message}\n${e.stack}\n${JSON.stringify(e)}`;
}

describe("toSafeDatabaseError", () => {
  it("maps a unique violation to a safe error with no cause, message or params", () => {
    const safe = toSafeDatabaseError(drizzleError(pgError("23505", "member_phone_uq")));
    expect(safe).toBeInstanceOf(SafeDatabaseError);
    expect(safe).toMatchObject({
      sqlState: "23505",
      constraint: "member_phone_uq",
      table: "member",
      message: "Database error on member.member_phone_uq",
    });
    expect((safe as Error).cause).toBeUndefined();
    expect(everything(safe)).not.toMatch(/712345678|Test Member/);
  });

  it("maps a Drizzle error with no SQLSTATE, such as a dropped connection", () => {
    const safe = toSafeDatabaseError(drizzleError(new Error("Connection terminated unexpectedly")));
    expect(safe).toBeInstanceOf(SafeDatabaseError);
    expect(everything(safe)).not.toMatch(/712345678|Test Member/);
  });

  it("maps a bare pg error", () => {
    expect(toSafeDatabaseError(pgError("23514"))).toMatchObject({ sqlState: "23514" });
  });

  it("leaves other errors alone", () => {
    const other = new TypeError("x is not a function");
    expect(toSafeDatabaseError(other)).toBe(other);
  });
});

describe("safeQuery", () => {
  it("rethrows database failures as safe errors", async () => {
    const error = await safeQuery(() =>
      Promise.reject(drizzleError(pgError("23505", "member_phone_uq"))),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SafeDatabaseError);
    expect(isUniqueViolation(error, "member_phone_uq")).toBe(true);
    expect(isUniqueViolation(error, "member_fwo_uq")).toBe(false);
  });

  it("returns the result on success", async () => {
    await expect(safeQuery(async () => 42)).resolves.toBe(42);
  });
});
