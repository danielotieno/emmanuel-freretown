import { describe, expect, it } from "vitest";
import { parseStatusKey } from "./status-check";

describe("parseStatusKey (FR-7, D24)", () => {
  it("reads an FWO number exactly as typed, leading zeros included (BR-01, D29)", () => {
    expect(parseStatusKey("0042")).toEqual({ kind: "fwo", value: "0042" });
    expect(parseStatusKey(" 42 ")).toEqual({ kind: "fwo", value: "42" });
  });

  it("reads a reference whatever its case", () => {
    expect(parseStatusKey("reg-7k3m9")).toEqual({ kind: "reference", value: "REG-7K3M9" });
    expect(parseStatusKey(" REG-7K3M9 ")).toEqual({ kind: "reference", value: "REG-7K3M9" });
  });

  it("refuses anything else", () => {
    for (const input of [
      "",
      "   ",
      "12a",
      "4 2",
      "-42",
      "REG-",
      "REG-7K3M0",
      "REG-7K3M9X",
      "7K3M9",
    ]) {
      expect(parseStatusKey(input)).toBeNull();
    }
  });
});
