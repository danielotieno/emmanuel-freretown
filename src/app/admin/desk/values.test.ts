import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countedSteps, emptyDeskValues, readDeskValues } from "./values";

describe("readDeskValues", () => {
  it("keeps only well-typed, bounded values from the browser", () => {
    const values = readDeskValues({
      eventLabel: "x".repeat(500),
      language: "fr",
      fullName: 42,
      isNewMember: "true",
      departmentIds: ["a", 7, "b".repeat(100), ...Array(30).fill("c")],
      phoneMode: "carrier-pigeon",
      phone: "0712 345 678 999 999 999",
      readBackConfirmed: true,
    });
    expect(values.eventLabel).toHaveLength(200);
    expect(values.language).toBe("en");
    expect(values.fullName).toBe("");
    expect(values.isNewMember).toBe(false);
    expect(values.departmentIds).toHaveLength(20);
    expect(values.departmentIds[1]).toHaveLength(64);
    expect(values.phoneMode).toBe("");
    expect(values.phone).toHaveLength(20);
    expect(values.readBackConfirmed).toBe(true);
  });

  it("reads nothing from something that isn't an object", () => {
    expect(readDeskValues(null)).toEqual(emptyDeskValues());
    expect(readDeskValues("values")).toEqual(emptyDeskValues());
  });
});

describe("countedSteps", () => {
  it("counts the code step only when a code is sent", () => {
    expect(countedSteps("otp")).toEqual(["event", "member", "phone", "confirm", "code"]);
    expect(countedSteps("none")).toEqual(["event", "member", "phone", "confirm"]);
    expect(countedSteps("")).toEqual(["event", "member", "phone", "confirm"]);
  });
});

describe("desk server actions (CLAUDE.md rule 1, NFR-8)", () => {
  // A server action can be called directly, without the page: each one must check the staff
  // session and the Registration Officer role before anything else. The role checks themselves
  // are tested against real Postgres (tests/integration/staff-auth.test.ts) and in Playwright
  // (tests/e2e/desk.spec.ts).
  const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
  const actions = [...source.matchAll(/export async function (\w+)\([^)]*\)[^{]*\{\n\s*(.*)/g)];

  it("exports the three desk actions, and nothing else the regex could miss", () => {
    expect(source.match(/^export /gm)).toHaveLength(3);
    expect(actions.map((a) => a[1])).toEqual([
      "checkDeskStep",
      "sendDeskCode",
      "submitDeskRegistration",
    ]);
  });

  it.each(actions.map((a) => [a[1], a[2]]))(
    "%s checks for a Registration Officer first",
    (_name, firstLine) => {
      expect(firstLine).toMatch(/requireStaff\("REGISTRATION_OFFICER"\);$/);
    },
  );
});
