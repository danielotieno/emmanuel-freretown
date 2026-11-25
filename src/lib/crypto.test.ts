import { describe, expect, it } from "vitest";
import { hmacSha256Hex, timingSafeEqual } from "./crypto";

describe("hmacSha256Hex", () => {
  it("matches RFC 4231 test case 2", async () => {
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("gives different keys different results for the same phone number", async () => {
    const a = await hmacSha256Hex("secret-a", "+254700000001");
    const b = await hmacSha256Hex("secret-b", "+254700000001");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("timingSafeEqual", () => {
  it("compares strings exactly", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
