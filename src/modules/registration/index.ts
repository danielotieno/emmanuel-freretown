/**
 * registration: intake, revisions, review and corrections (domain-model.md §3).
 * Public API of this module. Other code imports only from here.
 */
export {
  checkAccepted,
  checkAssistedRegistration,
  checkChosen,
  checkFullName,
  checkFwoNumber,
  checkPhone,
  checkSelfRegistration,
  type AssistedFieldName,
  type AssistedRegistrationFields,
  type FieldError,
  type FieldName,
  type FieldResult,
  type SelfRegistrationFields,
  type ValidAssistedRegistration,
  type ValidSelfRegistration,
} from "./fields";
export {
  submitAssistedRegistration,
  type AssistedRegistrationResult,
  type AssistedRegistrationSubmission,
} from "./assisted-registration";
export { PRIVACY_NOTICE_VERSION } from "./intake";
export { REFERENCE_PATTERN } from "./reference";
export {
  submitSelfRegistration,
  type SelfRegistrationResult,
  type SelfRegistrationSubmission,
} from "./self-registration";
