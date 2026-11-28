import type { StaffRole } from "@/modules/access";

/** Staff roles in words (requirements §3). Staff screens are English-only (NFR-5). */
export const ROLE_NAMES: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super Administrator",
  MEMBERSHIP_ADMIN: "Membership Administrator",
  REGISTRATION_OFFICER: "Registration Officer",
};
