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

  it("is true on the staff host's officer desk only (#18)", () => {
    expect(usesTurnstile("/desk", true)).toBe(true);
    expect(usesTurnstile("/desk/", true)).toBe(true);
    for (const path of ["/", "/sign-in", "/enrol", "/desks", "/registration", "/admin/desk"]) {
      expect(usesTurnstile(path, true), path).toBe(false);
    }
    // The desk path means nothing on the public site.
    expect(usesTurnstile("/desk")).toBe(false);
  });
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
