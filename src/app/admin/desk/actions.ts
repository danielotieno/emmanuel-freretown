"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { getDb, getDbOpener } from "@/app/_lib/db";
import {
  clientIp,
  getEnv,
  isTestMode,
  jobQueue,
  secret,
  smsProvider,
  TEST_OTP_CODE,
} from "@/app/_lib/env";
import { getLocale } from "@/app/_lib/i18n";
import { getLogger } from "@/app/_lib/log";
import { requireStaff } from "@/app/_lib/staff";
import type { Locale } from "@/i18n/locale";
import { sendNow } from "@/modules/notifications";
import { checkUnitsForRegistration } from "@/modules/organisation";
import {
  checkAssistedRegistration,
  submitAssistedRegistration,
  type AssistedFieldName,
  type FieldError,
  type ValidAssistedRegistration,
} from "@/modules/registration";
import { requestPhoneChallenge, verifyPhoneChallenge } from "@/modules/verification";
import { m } from "@/paraglide/messages";
import {
  DESK_STEP_FIELDS,
  DESK_STEPS,
  deskStepOf,
  readDeskValues,
  type DeskAnswer,
  type DeskField,
  type DeskStep,
  type DeskValues,
} from "./values";

/**
 * The officer desk's server actions (FR-3, #18). Each one checks the staff session and the
 * Registration Officer role first (CLAUDE.md rule 1): the page's own check is not enough, since
 * an action can be called directly. Answers are in the desk's language; the member's SMS go in
 * the language chosen for them. Nothing personal is logged (rule 2), and no answer says whether
 * an FWO or phone is already in the registry: conflicts are flagged for the administrator.
 */

/** The officer's form, as the registration module checks it. */
function toFields(values: DeskValues) {
  return {
    ...values,
    noPersonalPhone: values.phoneMode === "none",
    verification:
      values.phoneMode === "otp" ? "PHONE_OTP" : values.phoneMode === "" ? "" : "IN_PERSON",
  };
}

/** The desk field that shows a module field's error. */
const FIELD_OF: Record<AssistedFieldName, DeskField | null> = {
  fullName: "fullName",
  isNewMember: "isNewMember",
  fwoNumber: "fwoNumber",
  noPersonalPhone: "phoneMode",
  phone: "phone",
  hbcId: "hbcId",
  departmentIds: "departmentIds",
  verification: "phoneMode",
  eventLabel: "eventLabel",
  adultDeclared: "adultDeclared",
  privacyAcknowledged: "privacyAcknowledged",
  transferConsent: "transferConsent",
  readBackConfirmed: "readBackConfirmed",
};

function fieldMessage(field: DeskField, error: FieldError, locale: Locale): string {
  const o = { locale };
  if (error === "must_accept") return m.err_must_accept({}, o);
  if (error === "too_short") return m.err_too_short({}, o);
  if (error === "too_long") return m.err_too_long({}, o);
  if (error === "invalid") {
    if (field === "fwoNumber") return m.err_fwo_invalid({}, o);
    if (field === "phone") return m.err_phone_invalid({}, o);
    return m.err_choose({}, o);
  }
  return field === "hbcId" || field === "phoneMode" ? m.err_choose({}, o) : m.err_required({}, o);
}

type Checked =
  | { ok: true; value: ValidAssistedRegistration }
  | { ok: false; errors: DeskAnswer["errors"]; step: DeskStep };

/** Checks the whole form; on errors, only those of `steps` and the first step that has one. */
function check(values: DeskValues, locale: Locale, steps?: DeskStep[]): Checked {
  const checked = checkAssistedRegistration(toFields(values));
  if (checked.ok) return checked;
  const shown = steps ? new Set(steps.flatMap((s) => DESK_STEP_FIELDS[s] ?? [])) : null;
  const errors: DeskAnswer["errors"] = {};
  for (const [name, error] of Object.entries(checked.errors)) {
    const field = FIELD_OF[name as AssistedFieldName];
    if (!field || !error || (shown && !shown.has(field))) continue;
    errors[field] ??= fieldMessage(field, error, locale);
  }
  const step =
    DESK_STEPS.find((s) => Object.keys(errors).some((f) => deskStepOf(f as DeskField) === s)) ??
    "confirm";
  return { ok: false, errors, step };
}

async function requestId(): Promise<string | undefined> {
  return (await headers()).get("x-request-id") ?? undefined;
}

/** Back to the member step when an HBC or department was deactivated since the form loaded. */
function unavailable(
  units: { hbcUnavailable: boolean; unavailableDepartmentIds: string[] },
  locale: Locale,
): DeskAnswer {
  const message = m.err_unavailable({}, { locale });
  return {
    step: "member",
    errors: units.hbcUnavailable ? { hbcId: message } : { departmentIds: message },
    unavailableDepartmentIds: units.unavailableDepartmentIds,
  };
}

/** Checks one step's fields and says where to go next. */
export async function checkDeskStep(step: DeskStep, input: unknown): Promise<DeskAnswer> {
  await requireStaff("REGISTRATION_OFFICER");
  const locale = await getLocale();
  if (!DESK_STEP_FIELDS[step]) return { errors: {}, step: "event" };
  const checked = check(readDeskValues(input), locale, [step]);
  if (!checked.ok && Object.keys(checked.errors).length > 0) {
    return { errors: checked.errors, step };
  }
  return { errors: {}, step: DESK_STEPS[DESK_STEPS.indexOf(step) + 1] };
}

/**
 * Sends a code to the member's phone when it is at the desk (FR-3, FR-2). Turnstile and the rate
 * limits apply as on the public form (rule 8), except that the officer's hourly limit replaces
 * the per-IP one. The code goes out in the member's language.
 */
export async function sendDeskCode(input: unknown, turnstileToken: unknown): Promise<DeskAnswer> {
  const staff = await requireStaff("REGISTRATION_OFFICER");
  const locale = await getLocale();
  const o = { locale };
  const log = await getLogger();
  try {
    const values = readDeskValues(input);
    const checked = check(values, locale);
    if (!checked.ok) return { errors: checked.errors, step: checked.step };
    if (checked.value.verification !== "PHONE_OTP" || !checked.value.phoneE164) {
      return { errors: {}, step: "confirm" };
    }
    const db = await getDb();
    const units = await checkUnitsForRegistration(db, {
      hbcId: checked.value.hbcId,
      departmentIds: checked.value.departmentIds,
    });
    if (!units.ok) return unavailable(units, locale);

    const env = await getEnv();
    const result = await requestPhoneChallenge(
      db,
      {
        phone: checked.value.phoneE164,
        purpose: "REGISTRATION",
        language: values.language,
        ip: await clientIp(),
        turnstileToken: typeof turnstileToken === "string" ? turnstileToken : "",
        staffUserId: staff.userId,
      },
      {
        otpSecret: secret(env, "OTP_SECRET"),
        rateLimitSecret: secret(env, "RATE_LIMIT_SECRET"),
        turnstileSecret: secret(env, "TURNSTILE_SECRET_KEY"),
        provider: smsProvider(env),
        ...(isTestMode(env) ? { generateCode: () => TEST_OTP_CODE } : {}),
      },
    );
    log.info("desk.code_requested", { outcome: result.ok ? "sent" : result.reason });
    if (result.ok) return { errors: {}, step: "code", challengeId: result.challengeId };
    const notice = {
      invalid_phone: m.err_phone_invalid({}, o),
      turnstile: m.err_turnstile({}, o),
      ip: m.err_limit_ip({}, o),
      staff: m.desk_err_limit_staff({}, o),
      phone_resend: m.err_limit_resend({}, o),
      phone_hourly: m.desk_err_limit_hourly({}, o),
      send_failed: m.err_send_failed({}, o),
    }[result.reason];
    return { errors: {}, step: "confirm", notice };
  } catch (error) {
    log.error("desk.step_failed", error, { step: "confirm" });
    return { errors: {}, step: "confirm", notice: m.err_generic({}, o) };
  }
}

/**
 * Stores the registration (FR-3). With the phone at the desk, the code the member read out is
 * checked first and spent in the same transaction. The confirmation SMS goes out after the
 * response, except to a member with no personal phone.
 */
export async function submitDeskRegistration(
  input: unknown,
  verification?: { challengeId?: unknown; code?: unknown },
): Promise<DeskAnswer> {
  const staff = await requireStaff("REGISTRATION_OFFICER");
  const locale = await getLocale();
  const o = { locale };
  const log = await getLogger();
  const here: DeskStep = verification ? "code" : "confirm";
  try {
    const values = readDeskValues(input);
    const checked = check(values, locale);
    if (!checked.ok) return { errors: checked.errors, step: checked.step };

    const env = await getEnv();
    const otpSecret = secret(env, "OTP_SECRET");
    let verificationToken: string | undefined;
    if (checked.value.verification === "PHONE_OTP") {
      const challengeId = verification?.challengeId;
      const code = verification?.code;
      const verified = await verifyPhoneChallenge(
        await getDb(),
        {
          challengeId: typeof challengeId === "string" ? challengeId : "",
          code: typeof code === "string" ? code : "",
        },
        otpSecret,
      );
      if (!verified.ok) {
        log.info("desk.code_refused", { reason: verified.reason });
        if (verified.reason === "wrong_code") {
          return {
            step: "code",
            errors: { code: m.err_code_wrong({ count: verified.attemptsLeft }, o) },
          };
        }
        const notice = {
          expired: m.err_code_expired({}, o),
          too_many_attempts: m.err_code_too_many({}, o),
          invalid: m.err_code_expired({}, o),
        }[verified.reason];
        return { errors: {}, step: "confirm", notice };
      }
      verificationToken = verified.token;
    }

    const result = await submitAssistedRegistration(
      await getDb(),
      {
        registration: checked.value,
        officer: { type: "STAFF", userId: staff.userId },
        language: values.language,
        verificationToken,
        requestId: await requestId(),
      },
      otpSecret,
    );
    if (!result.ok) {
      log.info("desk.refused", { reason: result.reason });
      if (result.reason === "verification") {
        return { errors: {}, step: "confirm", notice: m.desk_err_verification({}, o) };
      }
      return unavailable(result, locale);
    }

    log.info("registration.submitted", {
      channel: "ASSISTED",
      verification: checked.value.verification,
    });
    if (result.smsId) {
      const smsId = result.smsId;
      const openDb = await getDbOpener();
      const provider = smsProvider(env);
      const jobs = jobQueue(env);
      after(() =>
        sendNow(openDb, smsId, { provider, jobs }).catch((error: unknown) =>
          log.error("registration.sms_failed", error),
        ),
      );
    }
    return { errors: {}, step: "done", reference: result.reference, sms: result.smsId !== null };
  } catch (error) {
    log.error("desk.step_failed", error, { step: here });
    return { errors: {}, step: here, notice: m.err_generic({}, o) };
  }
}
