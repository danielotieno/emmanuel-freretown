import { describe, expect, it } from "vitest";
import { generateReference, REFERENCE_PATTERN } from "./reference";

describe("generateReference (FR-1)", () => {
  it("always matches the database CHECK and never uses 0, O, 1 or I", () => {
    const references = Array.from({ length: 2000 }, generateReference);
    for (const reference of references) {
      expect(reference).toMatch(REFERENCE_PATTERN);
      expect(reference.slice(4)).not.toMatch(/[01OI]/);
    }
    expect(new Set(references).size).toBeGreaterThan(1990);
  });
});
