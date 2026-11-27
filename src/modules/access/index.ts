/**
 * access: staff users, roles and scopes (FR-10).
 * Public API of this module. Other code imports only from here.
 */
export { createAuth, type Auth, type AuthConfig } from "./auth";
export { accessJwtPolicy, passesAccess, type AccessJwtPolicy } from "./cloudflare-access";
export { handleAuthRequest } from "./handler";
export { GLOBAL, type RoleGrant, type RoleRequirement, type Scope, type StaffRole } from "./roles";
export {
  requireEnrollingStaff,
  requireStaff,
  staffNames,
  StaffAccessError,
  type EnrollingStaff,
  type Staff,
  type StaffRefusal,
  type StaffRequest,
} from "./staff";
