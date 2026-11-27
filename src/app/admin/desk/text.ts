import "server-only";
import type { Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

/**
 * The officer desk's fixed text in the desk's language (NFR-5), resolved on the server with an
 * explicit locale and passed to the form as plain strings, so the form ships no catalogue.
 */
export function deskText(locale: Locale) {
  const o = { locale };
  return {
    title: m.desk_title({}, o),
    intro: m.desk_intro({}, o),
    home: m.desk_home({}, o),
    loading: m.desk_loading({}, o),
    jsNeeded: m.desk_js_needed({}, o),
    restored: m.desk_restored({}, o),
    startOver: m.desk_start_over({}, o),
    startOverConfirm: m.desk_start_over_confirm({}, o),
    continue: m.reg_continue({}, o),
    back: m.reg_back({}, o),
    sendCode: m.desk_send_code({}, o),
    submit: m.desk_submit({}, o),
    newCode: m.desk_new_code({}, o),
    nextPerson: m.desk_next_person({}, o),
    offline: m.desk_offline({}, o),
    generic: m.err_generic({}, o),
    /** "Step {current} of {total}", with placeholders for the form to fill. */
    progress: m.reg_progress({ current: "{current}", total: "{total}" }, o),
    stepNames: {
      event: m.desk_step_event({}, o),
      member: m.desk_step_member({}, o),
      phone: m.desk_step_phone({}, o),
      confirm: m.desk_step_confirm({}, o),
      code: m.desk_step_code({}, o),
    },
    eventTitle: m.desk_event_title({}, o),
    eventLabel: m.desk_event_label({}, o),
    eventHint: m.desk_event_hint({}, o),
    languageLabel: m.desk_language_label({}, o),
    /** Each language named in its own language. */
    languages: { en: m.language_en({}, { locale: "en" }), sw: m.language_sw({}, { locale: "sw" }) },
    memberTitle: m.desk_member_title({}, o),
    nameLabel: m.desk_name_label({}, o),
    nameHint: m.desk_name_hint({}, o),
    fwoLabel: m.desk_fwo_label({}, o),
    fwoHint: m.desk_fwo_hint({}, o),
    newMemberLabel: m.desk_new_member_label({}, o),
    newMemberHint: m.desk_new_member_hint({}, o),
    newMemberValue: m.reg_new_member_value({}, o),
    hbcUnknownLabel: m.desk_hbc_unknown_label({}, o),
    hbcUnknownHint: m.desk_hbc_unknown_hint({}, o),
    hbcUnknownValue: m.reg_hbc_unknown_value({}, o),
    hbcLabel: m.desk_hbc_label({}, o),
    hbcChoose: m.desk_hbc_choose({}, o),
    departmentsLabel: m.desk_departments_label({}, o),
    departmentsHint: m.desk_departments_hint({}, o),
    none: m.reg_none({}, o),
    phoneTitle: m.desk_phone_title({}, o),
    phoneModes: {
      otp: { label: m.desk_phone_otp({}, o), hint: m.desk_phone_otp_hint({}, o) },
      unverified: {
        label: m.desk_phone_unverified({}, o),
        hint: m.desk_phone_unverified_hint({}, o),
      },
      none: { label: m.desk_phone_none({}, o), hint: m.desk_phone_none_hint({}, o) },
    },
    phoneLabel: m.desk_phone_label({}, o),
    phoneHint: m.desk_phone_hint({}, o),
    confirmTitle: m.desk_confirm_title({}, o),
    confirmHint: m.desk_confirm_hint({}, o),
    readBackLabel: m.desk_read_back_label({}, o),
    adultLabel: m.desk_adult_label({}, o),
    privacyLabel: m.desk_privacy_label({}, o),
    privacyLink: m.reg_privacy_link({}, o),
    consentLabel: m.desk_consent_label({}, o),
    consentHint: m.desk_consent_hint({}, o),
    verificationLabel: m.desk_verification_label({}, o),
    verificationValues: {
      otp: m.desk_verification_otp({}, o),
      unverified: m.desk_verification_unverified({}, o),
      none: m.desk_verification_none({}, o),
    },
    codeLabel: m.desk_code_label({}, o),
    /** "A 6-digit code was sent to {phone}…", with a placeholder. */
    codeSent: m.desk_code_sent({ phone: "{phone}" }, o),
    doneTitle: m.desk_done_title({}, o),
    doneReference: m.desk_done_reference({}, o),
    doneSms: m.desk_done_sms({}, o),
    doneNoSms: m.desk_done_no_sms({}, o),
    doneNewMember: m.desk_done_new_member({}, o),
  };
}

export type DeskText = ReturnType<typeof deskText>;
