import type { Staff } from "@/modules/access";

/**
 * Which parts of the staff portal to show a staff member. Only for showing links and tiles:
 * every page and action checks the role itself (CLAUDE.md rule 1).
 */
export function rolesOf(staff: Pick<Staff, "grants">) {
  const has = (role: Staff["grants"][number]["role"]) => staff.grants.some((g) => g.role === role);
  const superAdmin = has("SUPER_ADMIN");
  return {
    officer: has("REGISTRATION_OFFICER"),
    reviewer: superAdmin || has("MEMBERSHIP_ADMIN"),
    superAdmin,
  };
}
