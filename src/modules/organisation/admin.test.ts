import { describe, expect, it } from "vitest";
import { checkUnitName, unitKey } from "./admin";

describe("checkUnitName (FR-9)", () => {
  it("trims and keeps single spaces", () => {
    expect(checkUnitName("  Zion   Leisure ")).toEqual({ ok: true, value: "Zion Leisure" });
  });

  it.each([
    ["", "required"],
    ["   ", "required"],
    ["A", "too_short"],
    ["x".repeat(81), "too_long"],
    ["Jordan\u0007", "invalid"],
  ])("refuses %j as %s", (input, error) => {
    expect(checkUnitName(input)).toEqual({ ok: false, error });
  });

  it("counts characters, not bytes: 80 accented letters fit", () => {
    expect(checkUnitName("é".repeat(80)).ok).toBe(true);
  });
});

describe("unitKey (FR-9, FR-13)", () => {
  it("ignores case, spacing and curly apostrophes, as the import's matching does", () => {
    expect(unitKey("  Mother’s   UNION ")).toBe(unitKey("Mother's Union"));
    expect(unitKey("KAYO")).not.toBe(unitKey("KAYO Youth"));
  });
});
