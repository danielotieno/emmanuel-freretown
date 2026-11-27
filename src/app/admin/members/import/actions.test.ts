import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("member import server action (CLAUDE.md rule 1, NFR-8)", () => {
  // A server action can be called directly, without the page: it must check the staff session
  // and the Membership Administrator role before anything else (a Super Administrator
  // satisfies it, a Registration Officer alone doesn't: src/modules/access/roles.ts). The role
  // check itself is tested against real Postgres (tests/integration/staff-auth.test.ts) and in
  // Playwright (tests/e2e/member-import.spec.ts).
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const exported = [...source.matchAll(/^export async function (\w+)\([^)]*\)[^{]*\{\n\s*(.*)/gm)];

  it("exports one action, and no other function the check could miss", () => {
    expect(exported.map((a) => a[1])).toEqual(["importAction"]);
    expect(source.match(/^export (async function|const|function)/gm)).toHaveLength(1);
  });

  it("checks for a Membership Administrator first", () => {
    expect(exported[0]![2]).toMatch(/requireStaff\("MEMBERSHIP_ADMIN"\);$/);
  });
});
