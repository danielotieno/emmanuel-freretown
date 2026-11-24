import { describe, expect, it } from "vitest";
import { isDeniedKey, REDACTED, scrubText, scrubValue } from "./scrub";

// Synthetic values only (CLAUDE.md).
describe("scrubText", () => {
  it.each([
    ["+254712345678", "E.164"],
    ["254712345678", "without plus"],
    ["0712345678", "local"],
    ["0712 345 678", "spaced"],
    ["0112-345-678", "Safaricom 01x with hyphens"],
    ["+447700900123", "foreign E.164"],
  ])("removes the phone number %s (%s)", (phone) => {
    expect(scrubText(`call ${phone} now`)).toBe(`call ${REDACTED} now`);
  });

  it("removes Drizzle query parameters", () => {
    const message =
      'Failed query: insert into "member" ("full_name", "phone_e164") values ($1, $2)\nparams: Test Member,+254712345678';
    const out = scrubText(message);
    expect(out).not.toContain("Test Member");
    expect(out).not.toContain("712345678");
    expect(out).toContain("Failed query: insert into");
  });

  it("removes the value from a Postgres constraint detail", () => {
    expect(scrubText("Key (phone_e164)=(+254712345678) already exists.")).toBe(
      `Key (phone_e164)${REDACTED} already exists.`,
    );
  });

  it("removes FWO numbers, OTP codes and emails", () => {
    expect(scrubText("fwo 12345 code 482913 to someone@example.org")).toBe(
      `fwo ${REDACTED} code ${REDACTED} to ${REDACTED}`,
    );
  });

  it("keeps dates, UUIDs, ray ids and short numbers", () => {
    const text = "2026-11-24 6f1c2b3a-4d5e-4f70-8123-1234567890ab 8f1c2b3a4d5e6f70-FRA status 500";
    expect(scrubText(text)).toBe(text);
  });
});

describe("isDeniedKey", () => {
  it.each(["fullName", "full_name", "phoneE164", "phone_e164", "fwoNumber", "otpCode", "code"])(
    "denies %s",
    (key) => expect(isDeniedKey(key)).toBe(true),
  );

  it.each(["requestId", "registrationId", "hbcId", "status", "count", "routePath"])(
    "allows %s",
    (key) => expect(isDeniedKey(key)).toBe(false),
  );
});

describe("scrubValue", () => {
  it("redacts denied keys at any depth and scrubs strings", () => {
    expect(
      scrubValue({ a: { phoneE164: "+254712345678", note: "0712345678", n: 3 }, list: ["x"] }),
    ).toEqual({ a: { phoneE164: REDACTED, note: REDACTED, n: 3 }, list: ["x"] });
  });

  it("reduces nested errors to their name", () => {
    expect(scrubValue({ err: new Error("+254712345678") })).toEqual({
      err: { errorName: "Error" },
    });
  });
});
