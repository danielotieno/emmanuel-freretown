import { describe, expect, it } from "vitest";
import { GLOBAL, type RoleGrant } from "@/modules/access";
import { rolesOf } from "./roles";

const grant = (role: RoleGrant["role"], scope: RoleGrant["scope"] = GLOBAL): RoleGrant => ({
  role,
  scope,
});

describe("rolesOf (what the overview and the navigation show)", () => {
  it("opens each role's own part, and an administrator's part to a Super Administrator", () => {
    expect(rolesOf({ grants: [grant("REGISTRATION_OFFICER")] })).toEqual({
      officer: true,
      reviewer: false,
      superAdmin: false,
    });
    expect(rolesOf({ grants: [grant("MEMBERSHIP_ADMIN")] })).toEqual({
      officer: false,
      reviewer: true,
      superAdmin: false,
    });
    expect(rolesOf({ grants: [grant("SUPER_ADMIN")] })).toEqual({
      officer: false,
      reviewer: true,
      superAdmin: true,
    });
  });

  it("opens nothing parish-wide to a role granted for one HBC only", () => {
    const scoped = { type: "HBC", id: "00000000-0000-4000-8000-000000000001" } as const;
    expect(
      rolesOf({
        grants: [grant("MEMBERSHIP_ADMIN", scoped), grant("REGISTRATION_OFFICER", scoped)],
      }),
    ).toEqual({ officer: false, reviewer: false, superAdmin: false });
  });
});
