import { describe, expect, it } from "vitest";
import type { DbOrTx } from "../../db";
import { generateOtpCode, otpCodeHash, verifyPhoneChallenge } from "./otp";

describe("generateOtpCode (FR-2)", () => {
  it("is always six digits, leading zeros kept, and varies", () => {
    const codes = Array.from({ length: 2000 }, generateOtpCode);
    for (const code of codes) expect(code).toMatch(/^[0-9]{6}$/);
    expect(new Set(codes).size).toBeGreaterThan(1990);
    // Every leading digit appears, so codes below 100000 aren't lost.
    expect(new Set(codes.map((c) => c[0])).size).toBe(10);
  });
});

describe("otpCodeHash", () => {
  const secret = "test-otp-secret";

  it("is an HMAC that depends on the secret, the challenge and the code", async () => {
    const a = await otpCodeHash(secret, "challenge-a", "482913");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain("482913");
    expect(await otpCodeHash(secret, "challenge-a", "482913")).toBe(a);
    expect(await otpCodeHash(secret, "challenge-b", "482913")).not.toBe(a);
    expect(await otpCodeHash(secret, "challenge-a", "482914")).not.toBe(a);
    expect(await otpCodeHash("other-secret", "challenge-a", "482913")).not.toBe(a);
  });
});

describe("verifyPhoneChallenge", () => {
  it("refuses a challenge id that isn't a uuid without touching the database", async () => {
    const untouchable = new Proxy(
      {},
      {
        get() {
          throw new Error("the database must not be touched");
        },
      },
    ) as DbOrTx;
    expect(
      await verifyPhoneChallenge(untouchable, { challengeId: "1 OR 1=1", code: "000000" }, "s"),
    ).toEqual({ ok: false, reason: "invalid" });
  });
});
