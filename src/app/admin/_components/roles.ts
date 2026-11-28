import { isAllowed, type Staff } from "@/modules/access";

/**
 * What a staff member's roles open, by the access module's own rule (`isAllowed`): a role counts
 * only if it is granted for the whole parish, and a Super Administrator can do what a Membership
 * Administrator can. The navigation uses it to choose links, and the overview to choose which
 * figures to ask for, after `requireStaff`; every other page and action still calls
 * `requireStaff` with its role (CLAUDE.md rule 1).
 */
export function rolesOf(staff: Pick<Staff, "grants">) {
  return {
    officer: isAllowed(staff.grants, "REGISTRATION_OFFICER"),
    reviewer: isAllowed(staff.grants, "MEMBERSHIP_ADMIN"),
    superAdmin: isAllowed(staff.grants, "SUPER_ADMIN"),
  };
}
