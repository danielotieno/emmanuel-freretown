import { describe, expect, it } from "vitest";
import { SafeError } from "../observability";
import { assertNoSecrets, changes, isSecretKey, type AuditValues } from "./values";

describe("isSecretKey", () => {
  it.each([
    "otp",
    "otpCode",
    "OTPCode",
    "code",
    "code_hash",
    "codeHash",
    "pin",
    "salt",
    "passwordHash",
    "password",
    "clientSecret",
    "sessionToken",
    "refresh_token",
    "cookie",
    "api_key",
    "x-api-key",
    // One-word spellings (independent review of #11).
    "otpcode",
    "codehash",
    "passcode",
    "verificationcode",
    "onetimecode",
    "totp",
    "privateKey",
    "signingKey",
    "authorization",
  ])("treats %s as a secret", (key) => {
    expect(isSecretKey(key)).toBe(true);
  });

  // BR-12 needs before/after values, which include personal details; retention redaction
  // removes them from registration entries (BR-14). Only secrets are refused.
  it.each([
    "fullName",
    "full_name",
    "phoneE164",
    "fwoNumber",
    "hbcId",
    "status",
    "reason",
    "departmentIds",
    "pinned",
    "shipping",
    "monkey",
    "phoneVerified",
    "results",
  ])("allows %s", (key) => {
    expect(isSecretKey(key)).toBe(false);
  });
});

describe("assertNoSecrets", () => {
  it("accepts personal values and nothing", () => {
    expect(() =>
      assertNoSecrets({ fullName: "Test Person", phoneE164: "+254700000001" }),
    ).not.toThrow();
    expect(() => assertNoSecrets(undefined)).not.toThrow();
    expect(() => assertNoSecrets(null)).not.toThrow();
  });

  it("refuses a secret at any depth and names the key, never the value", () => {
    const attempts: AuditValues[] = [
      { codeHash: "abc123" },
      { verification: { otp: "482913" } },
      { challenges: [{ status: "USED" }, { code: "482913" }] },
    ];
    const paths = ["codeHash", "verification.otp", "challenges[1].code"];
    attempts.forEach((values, i) => {
      let error: unknown;
      try {
        assertNoSecrets(values);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(SafeError);
      expect((error as SafeError).code).toBe("audit_secret_value");
      expect((error as SafeError).message).toContain(paths[i]);
      expect((error as SafeError).message).not.toMatch(/482913|abc123/);
    });
  });
});

describe("changes", () => {
  it("keeps only the fields that changed", () => {
    expect(
      changes(
        { fullName: "A Person", hbcId: "h1", status: "ACTIVE", departmentIds: ["d1"] },
        { fullName: "A Person", hbcId: "h2", status: "ACTIVE", departmentIds: ["d1", "d2"] },
      ),
    ).toEqual({
      before: { hbcId: "h1", departmentIds: ["d1"] },
      after: { hbcId: "h2", departmentIds: ["d1", "d2"] },
    });
  });

  it("records a field missing on one side as null", () => {
    expect(changes({ reason: "Moved" }, { status: "INACTIVE" })).toEqual({
      before: { reason: "Moved", status: null },
      after: { reason: null, status: "INACTIVE" },
    });
  });

  it("ignores key order in nested objects but not array order", () => {
    expect(changes({ a: { x: 1, y: 2 } }, { a: { y: 2, x: 1 } })).toEqual({
      before: {},
      after: {},
    });
    expect(changes({ ids: ["d1", "d2"] }, { ids: ["d2", "d1"] })).toEqual({
      before: { ids: ["d1", "d2"] },
      after: { ids: ["d2", "d1"] },
    });
  });

  it("returns empty objects when nothing changed", () => {
    expect(changes({ a: 1 }, { a: 1 })).toEqual({ before: {}, after: {} });
  });
});
