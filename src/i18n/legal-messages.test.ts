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
  // HBC reads "Home Based Cell" (#96); wording only, approved via the technical lead.
  "2026-11-26": "ef31612e194ea9d2bbe66a6ca6595f7bf601c226568efcc6d18eae83e986eccc",
  // Elections become a stated purpose; details from the parish list (D47, D50, #106). Approved
  // by the Vicar, via the technical lead, 27 Nov 2026 (D39).
  "2026-11-27": "c6d46c4c99912d6b724aa14b3f773d55afec4e7d4d4bac0db2d68ed3ea6eeb6d",
  // Election records removed one week after the result (D51); the voting pages' visits (#112).
  // Approved by the Vicar, via the technical lead, 27 Nov 2026 (D39).
  "2026-11-28": "c079b825086d64c22be1afaa3bde602d1d427be9c38c92b38b58824ae2ca2e90",
  // Nominations and results: what is kept and for how long (D52, #115). Approved by the Vicar,
  // via the technical lead, 27 Nov 2026 (D39).
  "2026-11-29": "0996d85e6d527a7682c2f777d3e4fb5476fcc868b16a94d91021b5b4b59a19f3",
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
