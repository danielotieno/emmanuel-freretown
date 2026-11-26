"use server";

import { getDb } from "@/app/_lib/db";
import { clientIp, getEnv, isTestMode, secret, smsProvider, TEST_OTP_CODE } from "@/app/_lib/env";
import { getLocale } from "@/app/_lib/i18n";
import { getLogger } from "@/app/_lib/log";
import type { Locale } from "@/i18n/locale";
import { checkPhone, checkRegistrationStatus, parseStatusKey } from "@/modules/registration";
import { requestPhoneChallenge, verifyPhoneChallenge } from "@/modules/verification";
import { m } from "@/paraglide/messages";
import {
  EMPTY_STATUS_VALUES,
  isStatusStep,
  readStatusValues,
  type StatusOutcome,
  type StatusState,
  type StatusStep,
  type StatusValues,
} from "./state";

/**
 * One post of the status check (FR-7, BR-13, D24, D48): checks the phone and the FWO number or
 * reference, sends a code (FR-2, with Turnstile and the rate limits, rule 8), then verifies it
 * and only then looks the record up. Nothing in an answer before the code depends on whether a
 * phone, FWO number or reference is known, and every non-match gets the same answer (rule 3).
 * Logs carry outcomes only, never what was typed (rule 2).
 */
export async function statusStep(previous: StatusState, form: FormData): Promise<StatusState> {
  const locale = await getLocale();
  const values = readStatusValues(form);
  const step: StatusStep = isStatusStep(form.get("step"))
    ? (form.get("step") as StatusStep)
    : "details";
  const intent = form.get("intent");
  const challengeId =
    typeof form.get("challengeId") === "string" ? String(form.get("challengeId")) : undefined;
  const at = (next: StatusStep, extra: Partial<StatusState> = {}): StatusState => ({
    step: next,
    values,
    errors: {},
    ...extra,
    attempt: (previous?.attempt ?? 0) + 1,
  });

  if (intent === "back") return at("details");
  if (intent === "new-code") return at("review");

  try {
    const checked = checkDetails(values, locale);
    if (!checked.ok) return at("details", { errors: checked.errors });
    if (step === "details") return at("review");
    if (step === "review") return await sendCode(checked.phoneE164, form, locale, at);
    if (step === "code") return await verifyAndCheck(checked, form, challengeId, locale, at);
    return at("details");
  } catch (error) {
    (await getLogger()).error("status_check.step_failed", error, { step });
    return at(step, { challengeId, notice: m.err_generic({}, { locale }) });
  }
}

type At = (next: StatusStep, extra?: Partial<StatusState>) => StatusState;

type CheckedDetails =
  | { ok: true; phoneE164: string; key: NonNullable<ReturnType<typeof parseStatusKey>> }
  | { ok: false; errors: StatusState["errors"] };

/** The phone must be a Kenyan mobile (FR-2); the key an FWO number or a reference (D24). */
function checkDetails(values: StatusValues, locale: Locale): CheckedDetails {
  const o = { locale };
  const errors: StatusState["errors"] = {};
  const phone = checkPhone(values.phone);
  if (!phone.ok) {
    errors.phone = phone.error === "required" ? m.err_required({}, o) : m.err_phone_invalid({}, o);
  }
  const key = parseStatusKey(values.key);
  if (!key) {
    errors.key = values.key.trim() ? m.status_key_invalid({}, o) : m.err_required({}, o);
  }
  if (!phone.ok || !key) return { ok: false, errors };
  return { ok: true, phoneE164: phone.value, key };
}

async function sendCode(phoneE164: string, form: FormData, locale: Locale, at: At) {
  const o = { locale };
  const env = await getEnv();
  const token = form.get("cf-turnstile-response");
  const result = await requestPhoneChallenge(
    await getDb(),
    {
      phone: phoneE164,
      purpose: "STATUS_CHECK",
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
  (await getLogger()).info("status_check.code_requested", {
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

async function verifyAndCheck(
  details: Extract<CheckedDetails, { ok: true }>,
  form: FormData,
  challengeId: string | undefined,
  locale: Locale,
  at: At,
) {
  const o = { locale };
  const otpSecret = secret(await getEnv(), "OTP_SECRET");
  const code = form.get("code");
  const log = await getLogger();
  const verified = await verifyPhoneChallenge(
    await getDb(),
    { challengeId: challengeId ?? "", code: typeof code === "string" ? code : "" },
    otpSecret,
  );
  if (!verified.ok) {
    log.info("status_check.code_refused", { reason: verified.reason });
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

  const result = await checkRegistrationStatus(
    await getDb(),
    { phoneE164: details.phoneE164, key: details.key, verificationToken: verified.token },
    otpSecret,
  );
  if (!result.ok) {
    log.info("status_check.refused", { reason: result.reason });
    return at("review", { notice: m.err_verification({}, o) });
  }
  log.info("status_check.answered", { outcome: result.status });
  const outcome: StatusOutcome =
    result.status === "RECEIVED" || result.status === "REGISTERED_MEMBER"
      ? { status: result.status, fullName: result.fullName, hbcName: result.hbcName }
      : { status: result.status };
  // The answer replaces the form: what was typed is not sent back.
  return at("result", { outcome, values: EMPTY_STATUS_VALUES });
}
