import { readFileSync } from "node:fs";
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
    ["Jor\u200Bdan", "invalid"],
    ["\u202ENADROJ", "invalid"],
  ])("refuses %j as %s", (input, error) => {
    expect(checkUnitName(input)).toEqual({ ok: false, error });
  });

  it("stores the composed form of accented letters (NFC)", () => {
    expect(checkUnitName("Ze\u0301ze\u0301")).toEqual({ ok: true, value: "Zézé" });
  });

  it("counts characters, not bytes: 80 accented letters fit", () => {
    expect(checkUnitName("é".repeat(80)).ok).toBe(true);
  });
});

describe("unitKey (FR-9, FR-13)", () => {
  it("ignores case, spacing and curly apostrophes, as the import's matching does", () => {
    expect(unitKey("  Mother’s   UNION ")).toBe(unitKey("Mother's Union"));
    expect(unitKey("KAYO")).not.toBe(unitKey("KAYO Youth"));
    expect(unitKey("Ze\u0301ze\u0301")).toBe(unitKey("Zézé"));
  });
});

describe("unit changes' lock (FR-9, #145 review)", () => {
  // FOR UPDATE would conflict with the FOR KEY SHARE lock every foreign-key check takes, so an
  // administrator's change would block, and could deadlock with, registrations, approvals and
  // imports that refer to a unit. FOR NO KEY UPDATE still makes changes to a kind queue.
  it("locks units FOR NO KEY UPDATE, never FOR UPDATE", () => {
    const source = readFileSync(new URL("./admin.ts", import.meta.url), "utf8");
    expect(source).toContain('.for("no key update")');
    expect(source).not.toMatch(/\.for\("update"\)/);
  });
});
