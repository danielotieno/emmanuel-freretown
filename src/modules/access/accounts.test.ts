import { describe, expect, it } from "vitest";
import { checkNewStaffUser, temporaryPassword } from "./accounts";
import { randomString } from "./random";

describe("temporaryPassword", () => {
  it("is four groups of four unambiguous letters and digits", () => {
    for (let i = 0; i < 50; i++) {
      expect(temporaryPassword()).toMatch(
        /^[a-hjkmnp-zA-HJ-NP-Z2-9]{4}-[a-hjkmnp-zA-HJ-NP-Z2-9]{4}-[a-hjkmnp-zA-HJ-NP-Z2-9]{4}-[a-hjkmnp-zA-HJ-NP-Z2-9]{4}$/,
      );
    }
  });

  it("is different every time", () => {
    const seen = new Set(Array.from({ length: 200 }, temporaryPassword));
    expect(seen.size).toBe(200);
  });
});

describe("randomString", () => {
  it("uses only the alphabet, at the length asked for", () => {
    expect(randomString(1000, "ab")).toMatch(/^[ab]{1000}$/);
  });
});

describe("checkNewStaffUser", () => {
  const valid = { name: "Jane  Doe ", email: " Jane@Example.ORG ", roles: ["SUPER_ADMIN"] };

  it("tidies the name and lowercases the email", () => {
    expect(checkNewStaffUser(valid)).toEqual({
      ok: true,
      value: { name: "Jane Doe", email: "jane@example.org", roles: ["SUPER_ADMIN"] },
    });
  });

  it("keeps known roles only, in a fixed order", () => {
    const result = checkNewStaffUser({
      ...valid,
      roles: ["REGISTRATION_OFFICER", "OWNER", "MEMBERSHIP_ADMIN", "REGISTRATION_OFFICER"],
    });
    expect(result.ok && result.value.roles).toEqual(["MEMBERSHIP_ADMIN", "REGISTRATION_OFFICER"]);
  });

  it("says what's wrong with each field", () => {
    expect(checkNewStaffUser({ name: "", email: "", roles: [] })).toEqual({
      ok: false,
      errors: { name: "required", email: "required", roles: "required" },
    });
    expect(checkNewStaffUser({ ...valid, name: "Jane​Doe", email: "jane@" })).toEqual({
      ok: false,
      errors: { name: "invalid", email: "invalid" },
    });
    expect(
      checkNewStaffUser({ ...valid, name: "x".repeat(201), email: `${"x".repeat(250)}@a.org` }),
    ).toEqual({ ok: false, errors: { name: "too_long", email: "too_long" } });
  });
});
