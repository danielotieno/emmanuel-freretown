import { describe, expect, it } from "vitest";
import {
  GLOBAL,
  idleTimeoutMs,
  isAllowed,
  STAFF_ROLES,
  type RoleGrant,
  type StaffRole,
} from "./roles";

const grant = (role: StaffRole): RoleGrant => ({ role, scope: GLOBAL });

// Requirements §3: who may do work that needs each role. Every pair is listed, so a change to
// the rules shows up here as a deliberate edit (NFR-8).
const MATRIX: Record<StaffRole, Record<StaffRole, boolean>> = {
  SUPER_ADMIN: { SUPER_ADMIN: true, MEMBERSHIP_ADMIN: true, REGISTRATION_OFFICER: false },
  MEMBERSHIP_ADMIN: { SUPER_ADMIN: false, MEMBERSHIP_ADMIN: true, REGISTRATION_OFFICER: false },
  REGISTRATION_OFFICER: {
    SUPER_ADMIN: false,
    MEMBERSHIP_ADMIN: false,
    REGISTRATION_OFFICER: true,
  },
};

describe("isAllowed", () => {
  for (const held of STAFF_ROLES) {
    for (const needed of STAFF_ROLES) {
      const allowed = MATRIX[held][needed];
      it(`${held} ${allowed ? "may" : "may not"} do ${needed} work`, () => {
        expect(isAllowed([grant(held)], needed)).toBe(allowed);
      });
    }
    it(`${held} may see pages open to any staff member`, () => {
      expect(isAllowed([grant(held)], null)).toBe(true);
    });
  }

  it("refuses a staff user with no active role, even for pages open to any staff member", () => {
    expect(isAllowed([], null)).toBe(false);
    expect(isAllowed([], "REGISTRATION_OFFICER")).toBe(false);
  });

  it("combines roles: the Secretary and Wardens hold both administrator and officer", () => {
    const both = [grant("MEMBERSHIP_ADMIN"), grant("REGISTRATION_OFFICER")];
    expect(isAllowed(both, "MEMBERSHIP_ADMIN")).toBe(true);
    expect(isAllowed(both, "REGISTRATION_OFFICER")).toBe(true);
    expect(isAllowed(both, "SUPER_ADMIN")).toBe(false);
  });

  it("allows work any one of several roles may do: corrections (FR-5)", () => {
    const corrections = ["REGISTRATION_OFFICER", "MEMBERSHIP_ADMIN"] as const;
    expect(isAllowed([grant("REGISTRATION_OFFICER")], corrections)).toBe(true);
    expect(isAllowed([grant("MEMBERSHIP_ADMIN")], corrections)).toBe(true);
    // A Super Administrator satisfies Membership Administrator, so one of the list.
    expect(isAllowed([grant("SUPER_ADMIN")], corrections)).toBe(true);
    expect(isAllowed([], corrections)).toBe(false);
    expect(isAllowed([grant("REGISTRATION_OFFICER")], ["SUPER_ADMIN"])).toBe(false);
  });

  it("lets a GLOBAL grant cover any scope, and a scoped grant only its own", () => {
    const hbc = { type: "HBC", id: "11111111-1111-4111-8111-111111111111" } as const;
    const other = { type: "HBC", id: "22222222-2222-4222-8222-222222222222" } as const;
    expect(isAllowed([grant("MEMBERSHIP_ADMIN")], "MEMBERSHIP_ADMIN", hbc)).toBe(true);
    const scoped: RoleGrant[] = [{ role: "MEMBERSHIP_ADMIN", scope: hbc }];
    expect(isAllowed(scoped, "MEMBERSHIP_ADMIN", hbc)).toBe(true);
    expect(isAllowed(scoped, "MEMBERSHIP_ADMIN", other)).toBe(false);
    expect(isAllowed(scoped, "MEMBERSHIP_ADMIN")).toBe(false);
  });
});

describe("idleTimeoutMs (D32)", () => {
  const minutes = (grants: RoleGrant[]) => idleTimeoutMs(grants) / 60_000;

  it("is 4 hours for Registration Officers alone", () => {
    expect(minutes([grant("REGISTRATION_OFFICER")])).toBe(240);
  });

  it("is 30 minutes for anyone holding an administrator role, even with officer too", () => {
    expect(minutes([grant("MEMBERSHIP_ADMIN")])).toBe(30);
    expect(minutes([grant("SUPER_ADMIN")])).toBe(30);
    expect(minutes([grant("MEMBERSHIP_ADMIN"), grant("REGISTRATION_OFFICER")])).toBe(30);
    expect(minutes([grant("SUPER_ADMIN"), grant("REGISTRATION_OFFICER")])).toBe(30);
  });

  it("is the shorter timeout with no active role", () => {
    expect(minutes([])).toBe(30);
  });
});
