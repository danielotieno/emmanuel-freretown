import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json" with { type: "json" };
import { PRIVACY_NOTICE_VERSION } from "../modules/registration";

// The privacy notice, terms and cookies text (#27) is published as soon as it merges. Anything
// left in square brackets, such as "[CHURCH OFFICE EMAIL]", is a gap the parish must fill first.
describe("legal pages text", () => {
  const legal = Object.entries(en).filter(([key]) => /^(privacy|terms|cookies|legal)_/.test(key));

  it("exists", () => {
    expect(legal.length).toBeGreaterThan(20);
  });

  it.each(legal)("%s has no placeholder left", (_key, text) => {
    expect(text).not.toMatch(/\[[A-Z][A-Z0-9 ,.'-]*\]/);
  });
});

/**
 * Each approved version of the privacy notice, with a fingerprint of its exact English text.
 * Registrations record the version a member agreed to, and a staff correction carries consent
 * over only while the version is unchanged (BR-15, D35). So any change to the notice's text
 * must come with a new version: this test fails until it does.
 *
 * To change the notice: edit the `privacy_*` messages, get the Vicar's approval (D39), raise
 * PRIVACY_NOTICE_VERSION (registration module), and add the new version with the fingerprint
 * this test prints.
 */
const APPROVED_NOTICES: Record<string, string> = {
  "2026-11-25": "6e24d7a33b9c8d5568966e328ce3952d9f6b382cc730836231dbfc290a0aeb73",
};

describe("privacy notice version (BR-15, D35)", () => {
  it("changes whenever the notice's text changes", () => {
    const text = Object.entries(en)
      .filter(([key]) => key.startsWith("privacy_"))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
    const fingerprint = createHash("sha256").update(text).digest("hex");
    expect(
      APPROVED_NOTICES[PRIVACY_NOTICE_VERSION],
      `The privacy notice text changed. Raise PRIVACY_NOTICE_VERSION and add it here with ${fingerprint}`,
    ).toBe(fingerprint);
  });
});
