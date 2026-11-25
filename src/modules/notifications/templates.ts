import { z } from "zod";
import type { Locale } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { SafeError } from "../observability";

/** A registration reference, e.g. REG-7K3M9 (the CHECK on registration.reference). */
const reference = z.string().regex(/^REG-[2-9A-HJ-NP-Z]{5}$/);
const referenceOnly = z.strictObject({ reference });

/**
 * The SMS templates (FR-8, BR-16), each with the only parameters it may carry: the reference.
 * SMS text contains nothing beyond the reference and status, and never a name, FWO number or
 * department. Text lives in messages/en.json and messages/sw.json (rule 9, NFR-5). Every
 * text opens with "ACK Emmanuel Freretown - Kengeleni:": SMS come from the shared MOBILESASA
 * sender (D43), so the opening words identify the church as the sender. They don't prove it:
 * anyone can send any text from a shared sender. Only our own sender ID would.
 */
const TEMPLATES = {
  "registration.submitted": {
    params: referenceOnly,
    render: (p: { reference: string }, locale: Locale) =>
      m.sms_registration_submitted(p, { locale }),
  },
  "registration.submitted_new_member": {
    params: referenceOnly,
    render: (p: { reference: string }, locale: Locale) =>
      m.sms_registration_submitted_new_member(p, { locale }),
  },
  "registration.correction_requested": {
    params: referenceOnly,
    render: (p: { reference: string }, locale: Locale) =>
      m.sms_registration_correction_requested(p, { locale }),
  },
  "registration.approved": {
    params: referenceOnly,
    render: (p: { reference: string }, locale: Locale) =>
      m.sms_registration_approved(p, { locale }),
  },
} as const;

export type SmsTemplate = keyof typeof TEMPLATES;
export const SMS_TEMPLATES = Object.keys(TEMPLATES) as SmsTemplate[];
export type SmsParams = { reference: string };

export function isSmsTemplate(value: string): value is SmsTemplate {
  return Object.hasOwn(TEMPLATES, value);
}

/**
 * Checks a template's parameters: exactly the ones it takes, well formed. Throws a SafeError
 * that names the template, never the values.
 */
export function validateSmsParams(template: SmsTemplate, params: unknown): SmsParams {
  const parsed = TEMPLATES[template].params.safeParse(params);
  if (!parsed.success) {
    throw new SafeError("invalid_sms_params", `Invalid parameters for SMS template ${template}`);
  }
  return parsed.data;
}

/** The text of an outbox SMS in the member's language. */
export function renderSms(template: SmsTemplate, params: unknown, locale: Locale): string {
  return TEMPLATES[template].render(validateSmsParams(template, params), locale);
}

/**
 * The text of an OTP SMS. OTP codes never go through the outbox: the outbox keeps its
 * parameters in the database, and codes are stored only as a hash (rule 8).
 */
export function renderOtpSms(code: string, locale: Locale): string {
  if (!/^[0-9]{6}$/.test(code)) {
    throw new SafeError("invalid_otp_code", "An OTP code is six digits");
  }
  return m.sms_otp_code({ code }, { locale });
}
