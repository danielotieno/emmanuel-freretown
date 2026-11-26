/**
 * Staff roles and scopes (requirements §3, FR-10). Pure rules, no database.
 */

export const STAFF_ROLES = ["SUPER_ADMIN", "MEMBERSHIP_ADMIN", "REGISTRATION_OFFICER"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Where a role applies. Release 1 grants are all GLOBAL; HBC and department scopes are for Release 2 coordinators. */
export type Scope = { type: "GLOBAL" } | { type: "HBC" | "DEPARTMENT"; id: string };

export const GLOBAL: Scope = { type: "GLOBAL" };

/** An active role assignment. */
export interface RoleGrant {
  role: StaffRole;
  scope: Scope;
}

/**
 * The roles that satisfy a requirement for `role`. A Super Administrator can do "everything an
 * administrator can do" (requirements §3), so it satisfies Membership Administrator. Nothing
 * else is implied: a Registration Officer's work needs the Registration Officer role, which the
 * Church Secretary and Wardens are granted alongside Membership Administrator.
 */
const SATISFIED_BY: Record<StaffRole, readonly StaffRole[]> = {
  SUPER_ADMIN: ["SUPER_ADMIN"],
  MEMBERSHIP_ADMIN: ["MEMBERSHIP_ADMIN", "SUPER_ADMIN"],
  REGISTRATION_OFFICER: ["REGISTRATION_OFFICER"],
};

function covers(granted: Scope, required: Scope): boolean {
  if (granted.type === "GLOBAL") return true;
  return required.type === granted.type && required.id === granted.id;
}

/**
 * Whether `grants` allow work that needs `role` in `scope`. With no role, any active grant is
 * enough (pages every staff member may see, such as the staff home page).
 */
export function isAllowed(
  grants: readonly RoleGrant[],
  role: StaffRole | null,
  scope: Scope = GLOBAL,
): boolean {
  return grants.some(
    (g) => (role === null || SATISFIED_BY[role].includes(g.role)) && covers(g.scope, scope),
  );
}

const MINUTE = 60_000;

/**
 * Idle timeout (D32, Q22): 30 minutes for anyone holding Membership Administrator or Super
 * Administrator, even alongside Registration Officer; 4 hours for Registration Officers alone.
 * A staff user with no active role gets the shorter one.
 */
export function idleTimeoutMs(grants: readonly RoleGrant[]): number {
  const officerOnly = grants.length > 0 && grants.every((g) => g.role === "REGISTRATION_OFFICER");
  return officerOnly ? 240 * MINUTE : 30 * MINUTE;
}
