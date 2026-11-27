import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("member record server actions (CLAUDE.md rule 1, NFR-8)", () => {
  // Called directly, a server action skips the page: it must check the role before anything
  // else. The check itself is tested against real Postgres (tests/integration/staff-auth.test.ts)
  // and in Playwright (tests/e2e/members.spec.ts).
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const exported = [...source.matchAll(/^export async function (\w+)\([^)]*\)[^{]*\{\n\s*(.*)/gm)];

  it("exports the three actions, and no other function the check could miss", () => {
    expect(exported.map((a) => a[1])).toEqual([
      "editDetailsAction",
      "transferHbcAction",
      "changeStatusAction",
    ]);
    expect(source.match(/^export (async function|const|function)/gm)).toHaveLength(3);
  });

  it("checks for a Membership Administrator first in each (FR-6)", () => {
    for (const action of exported) {
      expect(action[2], action[1]).toMatch(/requireStaff\("MEMBERSHIP_ADMIN"\);$/);
    }
  });
});
