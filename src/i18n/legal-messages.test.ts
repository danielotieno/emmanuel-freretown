import { describe, expect, it } from "vitest";
import en from "../../messages/en.json" with { type: "json" };

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
