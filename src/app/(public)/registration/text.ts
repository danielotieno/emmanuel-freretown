import "server-only";
import type { Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

/**
 * The registration page's fixed text in the visitor's language, resolved on the server with an
 * explicit locale (CLAUDE.md conventions) and passed to the form as plain strings, so the form
 * ships no message catalogue.
 */
export function registrationText(locale: Locale) {
  const o = { locale };
  return {
    title: m.reg_title({}, o),
    intro: m.reg_intro({}, o),
    checkFirst: m.reg_check_first({}, o),
    checkFirstLink: m.reg_check_first_link({}, o),
    continue: m.reg_continue({}, o),
    back: m.reg_back({}, o),
    sendCode: m.reg_send_code({}, o),
    verify: m.reg_verify({}, o),
    newCode: m.reg_new_code({}, o),
    nameLabel: m.reg_name_label({}, o),
    nameHint: m.reg_name_hint({}, o),
    fwoLabel: m.reg_fwo_label({}, o),
    fwoHint: m.reg_fwo_hint({}, o),
    newMemberLabel: m.reg_new_member_label({}, o),
    newMemberHint: m.reg_new_member_hint({}, o),
    hbcLabel: m.reg_hbc_label({}, o),
    hbcChoose: m.reg_hbc_choose({}, o),
    hbcUnknownLabel: m.reg_hbc_unknown_label({}, o),
    hbcUnknownHint: m.reg_hbc_unknown_hint({}, o),
    hbcUnknownValue: m.reg_hbc_unknown_value({}, o),
    departmentsLabel: m.reg_departments_label({}, o),
    departmentsHint: m.reg_departments_hint({}, o),
    phoneLabel: m.reg_phone_label({}, o),
    phoneHint: m.reg_phone_hint({}, o),
    phoneOwn: m.reg_phone_own({}, o),
    whyWeAsk: m.reg_why_we_ask({}, o),
    phoneWhy: m.reg_phone_why({}, o),
    declarationsTitle: m.reg_declarations_title({}, o),
    adultLabel: m.reg_adult_label({}, o),
    privacyLabel: m.reg_privacy_label({}, o),
    privacyLink: m.reg_privacy_link({}, o),
    consentLabel: m.reg_consent_label({}, o),
    consentWhy: m.reg_consent_why({}, o),
    reviewTitle: m.reg_review_title({}, o),
    reviewHint: m.reg_review_hint({}, o),
    newMemberValue: m.reg_new_member_value({}, o),
    none: m.reg_none({}, o),
    codeTitle: m.reg_code_title({}, o),
    codeLabel: m.reg_code_label({}, o),
    codeHint: m.reg_code_hint({}, o),
    jsNeeded: m.reg_js_needed({}, o),
    doneTitle: m.reg_done_title({}, o),
    doneReference: m.reg_done_reference({}, o),
    doneSms: m.reg_done_sms({}, o),
    doneNext: m.reg_done_next({}, o),
    stepsLabel: m.reg_steps_label({}, o),
    /** The short name of each step, for the progress rail. */
    stepNames: {
      name: m.reg_step_name({}, o),
      fwo: m.reg_step_fwo({}, o),
      hbc: m.reg_step_hbc({}, o),
      departments: m.reg_step_departments({}, o),
      phone: m.reg_step_phone({}, o),
      declarations: m.reg_step_declarations({}, o),
      review: m.reg_step_review({}, o),
      code: m.reg_step_code({}, o),
    },
    helpTitle: m.reg_help_title({}, o),
    /** "… Call {phone}.", with a placeholder where the form puts the office number as a link. */
    helpBody: m.reg_help_body({ phone: "{phone}" }, o),
    /** "Step {current} of {total}", with placeholders for the form to fill. */
    progress: m.reg_progress({ current: "{current}", total: "{total}" }, o),
    /** "We sent a code to {phone}", with a placeholder. */
    codeSent: m.reg_code_sent({ phone: "{phone}" }, o),
  };
}

export type RegistrationText = ReturnType<typeof registrationText>;
