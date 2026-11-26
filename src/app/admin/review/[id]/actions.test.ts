import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("review server actions (CLAUDE.md rule 1, NFR-8)", () => {
  // A server action can be called directly, without the page: each one must check the staff
  // session and the Membership Administrator role before anything else (a Super Administrator
  // satisfies it, a Registration Officer alone doesn't: src/modules/access/roles.ts). The role
  // checks themselves are tested against real Postgres (tests/integration/staff-auth.test.ts)
  // and in Playwright (tests/e2e/review.spec.ts).
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const exported = [...source.matchAll(/^export async function (\w+)\([^)]*\)[^{]*\{\n\s*(.*)/gm)];

  it("exports the three decisions, and no other function the check could miss", () => {
    expect(exported.map((a) => a[1])).toEqual([
      "approveAction",
      "rejectAction",
      "correctionAction",
    ]);
    expect(source.match(/^export (async function|const|function)/gm)).toHaveLength(3);
  });

  it.each(exported.map((a) => [a[1], a[2]]))(
    "%s checks for a Membership Administrator first",
    (_name, firstLine) => {
      expect(firstLine).toMatch(/requireStaff\("MEMBERSHIP_ADMIN"\);$/);
    },
  );
});
