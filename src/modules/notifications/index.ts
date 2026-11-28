/**
 * notifications: SMS outbox, templates in English and Kiswahili (FR-8), the daily SMS cap
 * (D25) and the SMS provider, Mobile Sasa (D43).
 * Public API of this module. Other code imports only from here.
 */
export { getSmsSetting, reserveSms, smsUsageToday, type SmsSettingKey } from "./cap";
export { checkSmsBalance, isSmsConfigured, smsProviderFromEnv } from "./config";
export {
  recordDeliveryReport,
  verifyDeliverySignature,
  type DeliveryReportResult,
} from "./delivery";
export {
  dispatchSms,
  enqueueSms,
  purgeOldSms,
  sendNow,
  sendOtpSms,
  SMS_EXPIRY_DAYS,
  SMS_DISPATCH_JOB,
  sweepPendingSms,
  type DispatchOutcome,
  type JobQueue,
  type OtpSendOutcome,
  type OutboxSms,
} from "./outbox";
export {
  createMobileSasa,
  type MobileSasaConfig,
  type SendResult,
  type SmsMessage,
  type SmsProvider,
} from "./provider";
export {
  isSmsTemplate,
  renderOtpSms,
  renderSms,
  SMS_TEMPLATES,
  type SmsTemplate,
} from "./templates";
