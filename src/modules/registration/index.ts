/**
 * registration: intake, revisions, review and corrections (domain-model.md §3).
 * Public API of this module. Other code imports only from here.
 */
export {
  checkAccepted,
  checkAssistedRegistration,
  checkChosen,
  checkCorrection,
  checkFullName,
  checkFwoNumber,
  checkPhone,
  checkReason,
  checkSelfRegistration,
  type AssistedFieldName,
  type AssistedRegistrationFields,
  type CorrectionFieldName,
  type CorrectionFields,
  type FieldError,
  type FieldName,
  type FieldResult,
  type SelfRegistrationFields,
  type ValidAssistedRegistration,
  type ValidCorrection,
  type ValidSelfRegistration,
} from "./fields";
export {
  listCorrections,
  openRegistrationForCorrection,
  submitCorrection,
  type CorrectionItem,
  type CorrectionRefusal,
  type CorrectionResult,
} from "./correction";
export {
  findAssistedSubmission,
  submitAssistedRegistration,
  type AssistedRegistrationResult,
  type AssistedRegistrationSubmission,
} from "./assisted-registration";
export {
  getHighestFwoIssued,
  issueFwoNumber,
  setHighestFwoIssued,
  suggestFwoNumber,
  type HighestFwoIssued,
  type IssueFwoRefusal,
  type IssueFwoResult,
  type SetHighestResult,
} from "./fwo";
export { PRIVACY_NOTICE_VERSION } from "./intake";
export { importParishList } from "./parish-import";
export { REFERENCE_PATTERN } from "./reference";
export {
  checkRegistrationStatus,
  parseStatusKey,
  type StatusCheckResult,
  type StatusKey,
} from "./status-check";
export {
  submitSelfRegistration,
  type SelfRegistrationResult,
  type SelfRegistrationSubmission,
} from "./self-registration";
export {
  approveRegistration,
  listQueueEvents,
  listReviewQueue,
  openRegistrationForReview,
  QUEUE_FLAGS,
  rejectRegistration,
  requestCorrection,
  type DecisionRefusal,
  type DecisionResult,
  type QueueFilters,
  type QueueFlag,
  type QueueItem,
  type RegistrationForReview,
  type RevisionDetails,
} from "./review";
