/**
 * access: staff users, roles and scopes (FR-10).
 * Public API of this module. Other code imports only from here.
 */
export {
  createStaffUser,
  grantRole,
  listStaff,
  resetPassword,
  resetSecondFactor,
  revokeRole,
  revokeSessions,
  type CreateStaffResult,
  type StaffAccount,
  type StaffChangeRefusal,
  type StaffChangeResult,
  type StaffInputError,
  type TemporaryPasswordResult,
} from "./accounts";
export {
  createAuth,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  type Auth,
  type AuthConfig,
} from "./auth";
export {
  accessJwtPolicy,
  checkAccess,
  type AccessJwtPolicy,
  type AccessResult,
} from "./cloudflare-access";
export { handleAuthRequest } from "./handler";
export { purgeExpiredStaffRows } from "./purge";
export {
  changeOwnPassword,
  type PasswordChangeRefusal,
  type PasswordChangeResult,
} from "./password";
export {
  GLOBAL,
  isAllowed,
  STAFF_ROLES,
  type RoleGrant,
  type RoleRequirement,
  type Scope,
  type StaffRole,
} from "./roles";
export {
  requireEnrollingStaff,
  requirePasswordChange,
  requireStaff,
  staffNames,
  StaffAccessError,
  type EnrollingStaff,
  type Staff,
  type StaffRefusal,
  type StaffRequest,
} from "./staff";
