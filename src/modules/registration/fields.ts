import { normalizeKenyanPhone } from "../verification";

/**
 * Field rules for registration forms (FR-1, BR-01, BR-06, BR-07, BR-15, BR-16). Pure functions,
 * so a form can check one step at a time and the submission checks them all again. Each returns
 * the cleaned value or an error code that the form turns into a message (rule 9).
 */

export type FieldError = "required" | "too_short" | "too_long" | "invalid" | "must_accept";
export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: FieldError };

/** Matches the database CHECK: 2–120 characters once trimmed. Inner spaces are collapsed. */
export function checkFullName(input: string): FieldResult<string> {
  const value = input.trim().replace(/\s+/g, " ");
  if (!value) return { ok: false, error: "required" };
  if (value.length < 2) return { ok: false, error: "too_short" };
  if (value.length > 120) return { ok: false, error: "too_long" };
  return { ok: true, value };
}

/**
 * BR-01: digits only, stored exactly as entered: "0042" and "42" are different numbers. No
 * length rule yet. Spaces around it are trimmed; spaces inside are an error, not removed, so
 * nothing changes the number the member typed. A new member (BR-16) has none.
 */
export function checkFwoNumber(input: string, isNewMember: boolean): FieldResult<string | null> {
  if (isNewMember) return { ok: true, value: null };
  const value = input.trim();
  if (!value) return { ok: false, error: "required" };
  if (!/^[0-9]+$/.test(value)) return { ok: false, error: "invalid" };
  return { ok: true, value };
}

/** BR-06, FR-2: a Kenyan mobile number, stored in E.164. */
export function checkPhone(input: string): FieldResult<string> {
  if (!input.trim()) return { ok: false, error: "required" };
  const value = normalizeKenyanPhone(input);
  return value ? { ok: true, value } : { ok: false, error: "invalid" };
}

/** A required tick box: the 18+ declaration, the privacy notice, the consent (BR-07, BR-15). */
export function checkAccepted(input: boolean): FieldResult<true> {
  return input ? { ok: true, value: true } : { ok: false, error: "must_accept" };
}

/** Whether a value was chosen. Whether the HBC is active is checked against the database. */
export function checkChosen(input: string): FieldResult<string> {
  return input.trim() ? { ok: true, value: input.trim() } : { ok: false, error: "required" };
}

export interface SelfRegistrationFields {
  fullName: string;
  isNewMember: boolean;
  fwoNumber: string;
  phone: string;
  hbcId: string;
  departmentIds: string[];
  adultDeclared: boolean;
  privacyAcknowledged: boolean;
  transferConsent: boolean;
}

export interface ValidSelfRegistration {
  fullName: string;
  isNewMember: boolean;
  fwoNumber: string | null;
  phoneE164: string;
  hbcId: string;
  departmentIds: string[];
}

export type FieldName = keyof SelfRegistrationFields;

/** Checks every field; the errors are keyed by field. */
export function checkSelfRegistration(
  fields: SelfRegistrationFields,
):
  | { ok: true; value: ValidSelfRegistration }
  | { ok: false; errors: Partial<Record<FieldName, FieldError>> } {
  const results = {
    fullName: checkFullName(fields.fullName),
    fwoNumber: checkFwoNumber(fields.fwoNumber, fields.isNewMember),
    phone: checkPhone(fields.phone),
    hbcId: checkChosen(fields.hbcId),
    adultDeclared: checkAccepted(fields.adultDeclared),
    privacyAcknowledged: checkAccepted(fields.privacyAcknowledged),
    transferConsent: checkAccepted(fields.transferConsent),
  };
  const errors: Partial<Record<FieldName, FieldError>> = {};
  for (const [name, result] of Object.entries(results)) {
    if (!result.ok) errors[name as FieldName] = result.error;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const ok = <T>(r: FieldResult<T>) => (r as { ok: true; value: T }).value;
  return {
    ok: true,
    value: {
      fullName: ok(results.fullName),
      isNewMember: fields.isNewMember,
      fwoNumber: ok(results.fwoNumber),
      phoneE164: ok(results.phone),
      hbcId: ok(results.hbcId),
      departmentIds: [...new Set(fields.departmentIds.map((d) => d.trim()).filter(Boolean))],
    },
  };
}

/**
 * The event where the officer met the member (FR-3), e.g. "Judea HBC AGM, 17 Jan 2027". Shown
 * to administrators and used to filter the review queue (FR-4). Same length rule as a name.
 */
export function checkEventLabel(input: string): FieldResult<string> {
  return checkFullName(input);
}

/**
 * How an assisted registration's details were checked (FR-3, requirements §6): the member's
 * phone was at the desk and a code was entered (`PHONE_OTP`), or it wasn't, or they have no
 * personal phone, and the officer records meeting them (`IN_PERSON`).
 */
export const ASSISTED_VERIFICATIONS = ["PHONE_OTP", "IN_PERSON"] as const;
export type AssistedVerification = (typeof ASSISTED_VERIFICATIONS)[number];

export interface AssistedRegistrationFields {
  fullName: string;
  isNewMember: boolean;
  fwoNumber: string;
  /** BR-06: the member has no phone of their own. Only an officer can record it. */
  noPersonalPhone: boolean;
  phone: string;
  hbcId: string;
  departmentIds: string[];
  verification: string;
  eventLabel: string;
  /** The member declared they are 18 or older (BR-07). */
  adultDeclared: boolean;
  /** The member acknowledged the privacy notice (BR-07, FR-3). */
  privacyAcknowledged: boolean;
  /** The member gave their consent to storage outside Kenya, verbally (BR-15). */
  transferConsent: boolean;
  /** The officer read the details back and the member confirmed them (FR-3). */
  readBackConfirmed: boolean;
}

export interface ValidAssistedRegistration {
  fullName: string;
  isNewMember: boolean;
  fwoNumber: string | null;
  /** Null when the member has no personal phone. */
  phoneE164: string | null;
  noPersonalPhone: boolean;
  hbcId: string;
  departmentIds: string[];
  verification: AssistedVerification;
  eventLabel: string;
}

export type AssistedFieldName = keyof AssistedRegistrationFields;

function checkVerification(
  input: string,
  noPersonalPhone: boolean,
): FieldResult<AssistedVerification> {
  if (!(ASSISTED_VERIFICATIONS as readonly string[]).includes(input)) {
    return { ok: false, error: "required" };
  }
  // Without a phone there is nothing to send a code to.
  if (noPersonalPhone && input === "PHONE_OTP") return { ok: false, error: "invalid" };
  return { ok: true, value: input as AssistedVerification };
}

/**
 * Checks every field of an assisted registration (FR-3): FR-1's fields, the verification method
 * and the event, and the officer's confirmations. A member with no personal phone has no phone
 * number, and whatever was typed in the phone field is dropped. The errors are keyed by field.
 */
export function checkAssistedRegistration(
  fields: AssistedRegistrationFields,
):
  | { ok: true; value: ValidAssistedRegistration }
  | { ok: false; errors: Partial<Record<AssistedFieldName, FieldError>> } {
  const results = {
    fullName: checkFullName(fields.fullName),
    fwoNumber: checkFwoNumber(fields.fwoNumber, fields.isNewMember),
    phone: fields.noPersonalPhone
      ? ({ ok: true, value: null } as FieldResult<string | null>)
      : checkPhone(fields.phone),
    hbcId: checkChosen(fields.hbcId),
    verification: checkVerification(fields.verification, fields.noPersonalPhone),
    eventLabel: checkEventLabel(fields.eventLabel),
    adultDeclared: checkAccepted(fields.adultDeclared),
    privacyAcknowledged: checkAccepted(fields.privacyAcknowledged),
    transferConsent: checkAccepted(fields.transferConsent),
    readBackConfirmed: checkAccepted(fields.readBackConfirmed),
  };
  const errors: Partial<Record<AssistedFieldName, FieldError>> = {};
  for (const [name, result] of Object.entries(results)) {
    if (!result.ok) errors[name as AssistedFieldName] = result.error;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  const ok = <T>(r: FieldResult<T>) => (r as { ok: true; value: T }).value;
  return {
    ok: true,
    value: {
      fullName: ok(results.fullName),
      isNewMember: fields.isNewMember,
      fwoNumber: ok(results.fwoNumber),
      phoneE164: ok(results.phone),
      noPersonalPhone: fields.noPersonalPhone,
      hbcId: ok(results.hbcId),
      departmentIds: [...new Set(fields.departmentIds.map((d) => d.trim()).filter(Boolean))],
      verification: ok(results.verification),
      eventLabel: ok(results.eventLabel),
    },
  };
}
