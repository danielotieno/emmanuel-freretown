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
import type { Locale } from "@/i18n/locale";
import { sendNow } from "@/modules/notifications";
import { checkUnitsForRegistration } from "@/modules/organisation";
import {
  checkSelfRegistration,
  submitSelfRegistration,
  type FieldError,
  type FieldName,
} from "@/modules/registration";
import { requestPhoneChallenge, verifyPhoneChallenge } from "@/modules/verification";
import { m } from "@/paraglide/messages";
import {
  EMPTY_VALUES,
  isStep,
  readValues,
  STEP_FIELDS,
  stepOf,
  STEPS,
  type ErrorField,
  type FormValues,
  type RegistrationState,
  type Step,
} from "./state";

/**
 * One post of the registration form (FR-1): checks the current step and moves on, sends the
 * code (FR-2), or verifies it and stores the registration. Works with and without JavaScript:
 * the state it returns is rendered either way. Nothing in the answer depends on whether an FWO
 * or phone is already known (rule 3), and nothing personal is logged (rule 2).
 */
export async function registrationStep(
  previous: RegistrationState,
  form: FormData,
): Promise<RegistrationState> {
  const locale = await getLocale();
  const values = readValues(form);
  const step: Step = isStep(form.get("step")) ? (form.get("step") as Step) : "name";
  const intent = form.get("intent");
  const challengeId =
    typeof form.get("challengeId") === "string" ? String(form.get("challengeId")) : undefined;
  const at = (next: Step, extra: Partial<RegistrationState> = {}): RegistrationState => ({
    step: next,
    values,
    errors: {},
    ...extra,
    attempt: (previous?.attempt ?? 0) + 1,
  });

  if (intent === "back") return at(STEPS[Math.max(STEPS.indexOf(step) - 1, 0)]!);
  if (intent === "new-code") return at("review");

  try {
    if (step === "review") return await sendCode(values, form, locale, at);
    if (step === "code") return await verifyAndSubmit(values, form, challengeId, locale, at);

    const errors = checkStep(step, values, locale);
    if (Object.keys(errors).length > 0) return at(step, { errors });
    return at(STEPS[STEPS.indexOf(step) + 1]!);
  } catch (error) {
    (await getLogger()).error("registration.step_failed", error, { step });
    return at(step, { challengeId, notice: m.err_generic({}, { locale }) });
  }
}

type At = (next: Step, extra?: Partial<RegistrationState>) => RegistrationState;

function fieldMessage(field: ErrorField, error: FieldError, locale: Locale): string {
  const o = { locale };
  if (error === "must_accept") return m.err_must_accept({}, o);
  if (error === "too_short") return m.err_too_short({}, o);
  if (error === "too_long") return m.err_too_long({}, o);
  if (error === "invalid") {
    return field === "fwoNumber" ? m.err_fwo_invalid({}, o) : m.err_phone_invalid({}, o);
  }
  return field === "hbcId" ? m.err_choose({}, o) : m.err_required({}, o);
}

/** Messages for field errors, in the visitor's language. */
function messages(
  found: Partial<Record<FieldName, FieldError>>,
  locale: Locale,
): RegistrationState["errors"] {
  const errors: RegistrationState["errors"] = {};
  for (const [field, error] of Object.entries(found)) {
    if (error) errors[field as FieldName] = fieldMessage(field as FieldName, error, locale);
  }
  return errors;
}

/** The current step's field errors: the whole form is checked, and its fields kept. */
function checkStep(step: Step, values: FormValues, locale: Locale): RegistrationState["errors"] {
  const checked = checkSelfRegistration(values);
  if (checked.ok) return {};
  const fields = new Set<FieldName>(STEP_FIELDS[step] ?? []);
  const found: Partial<Record<FieldName, FieldError>> = {};
  for (const [field, error] of Object.entries(checked.errors)) {
    if (fields.has(field as FieldName)) found[field as FieldName] = error;
  }
  return messages(found, locale);
}

/** The first step with an error, so the member is sent back to fix it. */
function firstStepWith(errors: RegistrationState["errors"]): Step {
  const steps = (Object.keys(errors) as ErrorField[])
    .filter((field): field is FieldName => field !== "code")
    .map(stepOf);
  return STEPS.find((step) => steps.includes(step)) ?? "review";
}

async function sendCode(values: FormValues, form: FormData, locale: Locale, at: At) {
  const o = { locale };
  const checked = checkSelfRegistration(values);
  if (!checked.ok) {
    const errors = messages(checked.errors, locale);
    return at(firstStepWith(errors), { errors });
  }
  // A deactivated HBC or department is caught before an SMS is spent; the submission checks
  // again, in its transaction.
  const units = await checkUnitsForRegistration(await getDb(), {
    hbcId: checked.value.hbcId,
    departmentIds: checked.value.departmentIds,
  });
  if (!units.ok) return unavailable(values, units, locale, at);
  const env = await getEnv();
  const token = form.get("cf-turnstile-response");
  const result = await requestPhoneChallenge(
    await getDb(),
    {
      phone: checked.value.phoneE164,
      purpose: "REGISTRATION",
      language: locale,
      ip: await clientIp(),
      turnstileToken: typeof token === "string" ? token : "",
    },
    {
      otpSecret: secret(env, "OTP_SECRET"),
      rateLimitSecret: secret(env, "RATE_LIMIT_SECRET"),
      turnstileSecret: secret(env, "TURNSTILE_SECRET_KEY"),
      provider: smsProvider(env),
      ...(isTestMode(env) ? { generateCode: () => TEST_OTP_CODE } : {}),
    },
  );
  (await getLogger()).info("registration.code_requested", {
    outcome: result.ok ? "sent" : result.reason,
  });
  if (result.ok) return at("code", { challengeId: result.challengeId });
  const notice = {
    invalid_phone: m.err_phone_invalid({}, o),
    turnstile: m.err_turnstile({}, o),
    ip: m.err_limit_ip({}, o),
    // Only the officer desk counts codes per officer; this page never does.
    staff: m.err_generic({}, o),
    phone_resend: m.err_limit_resend({}, o),
    phone_hourly: m.err_limit_hourly({}, o),
    send_failed: m.err_send_failed({}, o),
  }[result.reason];
  return at("review", { notice });
}

async function verifyAndSubmit(
  values: FormValues,
  form: FormData,
  challengeId: string | undefined,
  locale: Locale,
  at: At,
) {
  const o = { locale };
  const env = await getEnv();
  const otpSecret = secret(env, "OTP_SECRET");
  const code = form.get("code");
  const verified = await verifyPhoneChallenge(
    await getDb(),
    { challengeId: challengeId ?? "", code: typeof code === "string" ? code : "" },
    otpSecret,
  );
  if (!verified.ok) {
    const log = await getLogger();
    log.info("registration.code_refused", { reason: verified.reason });
    if (verified.reason === "wrong_code") {
      return at("code", {
        challengeId,
        errors: { code: m.err_code_wrong({ count: verified.attemptsLeft }, o) },
      });
    }
    const notice = {
      expired: m.err_code_expired({}, o),
      too_many_attempts: m.err_code_too_many({}, o),
      invalid: m.err_code_expired({}, o),
    }[verified.reason];
    return at("review", { notice });
  }

  const checked = checkSelfRegistration(values);
  if (!checked.ok) {
    const errors = messages(checked.errors, locale);
    return at(firstStepWith(errors), { errors });
  }
  const requestId = (await headers()).get("x-request-id") ?? undefined;
  const result = await submitSelfRegistration(
    await getDb(),
    { registration: checked.value, language: locale, verificationToken: verified.token, requestId },
    otpSecret,
  );
  const log = await getLogger();
  if (!result.ok) {
    log.info("registration.refused", { reason: result.reason });
    if (result.reason === "verification")
      return at("review", { notice: m.err_verification({}, o) });
    return unavailable(values, result, locale, at);
  }

  log.info("registration.submitted", { channel: "SELF" });
  // The confirmation SMS goes out after the response, with its own database handle.
  const openDb = await getDbOpener();
  const provider = smsProvider(env);
  const jobs = jobQueue(env);
  after(() =>
    sendNow(openDb, result.smsId, { provider, jobs }).catch((error: unknown) =>
      log.error("registration.sms_failed", error),
    ),
  );
  // Nothing personal goes back: the done step shows only the reference.
  return at("done", { reference: result.reference, values: EMPTY_VALUES });
}

/** Back to the HBC or departments step when a choice was deactivated since the form loaded. */
function unavailable(
  values: FormValues,
  units: { hbcUnavailable: boolean; unavailableDepartmentIds: string[] },
  locale: Locale,
  at: At,
): RegistrationState {
  const message = m.err_unavailable({}, { locale });
  return at(units.hbcUnavailable ? "hbc" : "departments", {
    errors: units.hbcUnavailable ? { hbcId: message } : { departmentIds: message },
    values: {
      ...values,
      departmentIds: values.departmentIds.filter(
        (id) => !units.unavailableDepartmentIds.includes(id),
      ),
    },
  });
}
