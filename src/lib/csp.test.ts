import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, usesTurnstile } from "./csp";

describe("usesTurnstile", () => {
  it.each(["/registration", "/registration/status"])("is true on %s", (path) => {
    expect(usesTurnstile(path)).toBe(true);
  });

  it.each(["/", "/vote", "/registrations", "/admin/registration", "/api/webhooks/sms-delivery"])(
    "is false on %s",
    (path) => {
      expect(usesTurnstile(path)).toBe(false);
    },
  );
});

describe("contentSecurityPolicy (issue #13)", () => {
  it("allows Turnstile's script and frame only where asked", () => {
    const withTurnstile = contentSecurityPolicy("abc", true);
    expect(withTurnstile).toContain(
      "script-src 'self' 'nonce-abc' 'strict-dynamic' https://challenges.cloudflare.com",
    );
    expect(withTurnstile).toContain("frame-src https://challenges.cloudflare.com");

    const without = contentSecurityPolicy("abc");
    expect(without).not.toContain("challenges.cloudflare.com");
    expect(without).toContain("frame-src 'none'");
  });
});
