import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("change-password server action (CLAUDE.md rule 1)", () => {
  // The check itself is tested against real Postgres (tests/integration/staff-auth.test.ts).
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const exported = [...source.matchAll(/^export async function (\w+)\([^)]*\)[^{]*\{\n\s*(.*)/gm)];

  it("exports one action, which checks the signed-in staff member first", () => {
    expect(exported.map((a) => a[1])).toEqual(["changePasswordAction"]);
    expect(source.match(/^export (async function|const|function)/gm)).toHaveLength(1);
    expect(exported[0]?.[2]).toMatch(/requirePasswordChange\(\);$/);
  });
});
