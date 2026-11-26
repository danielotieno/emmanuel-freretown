/**
 * access: staff users, roles and scopes (FR-10).
 * Public API of this module. Other code imports only from here.
 */
export {
  ALLOWED_AUTH_PATHS,
  createAuth,
  SESSION_MAX_AGE_SECONDS,
  type Auth,
  type AuthConfig,
} from "./auth";
export {
  ACCESS_JWT_HEADER,
  accessJwtPolicy,
  passesAccess,
  type AccessJwtPolicy,
} from "./cloudflare-access";
export {
  GLOBAL,
  idleTimeoutMs,
  isAllowed,
  STAFF_ROLES,
  type RoleGrant,
  type Scope,
  type StaffRole,
} from "./roles";
export { handleAuthRequest } from "./handler";
export {
  requireEnrollingStaff,
  requireStaff,
  StaffAccessError,
  type EnrollingStaff,
  type Staff,
  type StaffRefusal,
  type StaffRequest,
} from "./staff";
