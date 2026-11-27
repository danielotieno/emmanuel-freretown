import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("member search server action (CLAUDE.md rule 1, NFR-8)", () => {
  // Called directly, a server action skips the page: it must check the role before anything
  // else, and the terms it receives are personal data (rule 2).
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const exported = [...source.matchAll(/^export async function (\w+)\([^)]*\)[^{]*\{\n\s*(.*)/gm)];

  it("exports one action, and no other function the check could miss", () => {
    expect(exported.map((a) => a[1])).toEqual(["searchAction"]);
    expect(source.match(/^export (async function|const|function)/gm)).toHaveLength(1);
  });

  it("checks for a Membership Administrator first (FR-6)", () => {
    expect(exported[0]![2]).toMatch(/requireStaff\("MEMBERSHIP_ADMIN"\);$/);
  });

  it("logs the number of results, never the terms (rule 2)", () => {
    for (const call of source.matchAll(/log\.info\(([^;]*)\);/g)) {
      expect(call[1]).not.toMatch(/query/);
    }
  });
});
