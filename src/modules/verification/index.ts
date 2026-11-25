/**
 * verification: phone OTP challenges and verification evidence (domain-model.md §3), and the
 * protections in front of every endpoint that can send an SMS (rule 8): Kenyan numbers only,
 * Turnstile and rate limits.
 * Public API of this module. Other code imports only from here.
 */
export {
  generateOtpCode,
  OTP_MAX_ATTEMPTS,
  OTP_VALID_SECONDS,
  recordPhoneOtpEvidence,
  redeemVerificationToken,
  requestPhoneChallenge,
  TOKEN_VALID_SECONDS,
  verifyPhoneChallenge,
  type OtpDeps,
  type OtpPurpose,
  type OtpRequest,
  type OtpRequestResult,
  type OtpVerifyResult,
} from "./otp";
export { purgeExpiredChallenges } from "./purge";
export { KENYAN_MOBILE_E164, normalizeKenyanPhone } from "./phone";
export {
  checkOtpSendLimits,
  consumeRateLimit,
  OTP_LIMITS,
  purgeExpiredRateLimits,
  type OtpSendCheck,
  type RateLimit,
} from "./rate-limit";
export { TURNSTILE_VERIFY_URL, verifyTurnstile, type TurnstileOptions } from "./turnstile";
