/**
 * registration: intake, revisions, review and corrections (domain-model.md §3).
 * Public API of this module. Other code imports only from here.
 */
export {
  checkAccepted,
  checkChosen,
  checkFullName,
  checkFwoNumber,
  checkPhone,
  checkSelfRegistration,
  type FieldError,
  type FieldName,
  type FieldResult,
  type SelfRegistrationFields,
  type ValidSelfRegistration,
} from "./fields";
export { REFERENCE_PATTERN } from "./reference";
export {
  PRIVACY_NOTICE_VERSION,
  submitSelfRegistration,
  type SelfRegistrationResult,
  type SelfRegistrationSubmission,
} from "./self-registration";
