import "server-only";
import type { Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

/**
 * The status check's fixed text in the visitor's language, resolved on the server with an
 * explicit locale and passed to the form as plain strings, so the form ships no catalogue.
 */
export function statusText(locale: Locale) {
  const o = { locale };
  return {
    title: m.status_title({}, o),
    intro: m.status_intro({}, o),
    continue: m.reg_continue({}, o),
    back: m.reg_back({}, o),
    sendCode: m.reg_send_code({}, o),
    check: m.status_check({}, o),
    newCode: m.reg_new_code({}, o),
    phoneLabel: m.status_phone_label({}, o),
    phoneHint: m.status_phone_hint({}, o),
    keyLabel: m.status_key_label({}, o),
    keyHint: m.status_key_hint({}, o),
    reviewTitle: m.status_review_title({}, o),
    reviewHint: m.status_review_hint({}, o),
    jsNeeded: m.status_js_needed({}, o),
    codeLabel: m.reg_code_label({}, o),
    codeHint: m.reg_code_hint({}, o),
    /** "We sent a code to {phone}", with a placeholder. */
    codeSent: m.reg_code_sent({ phone: "{phone}" }, o),
    receivedTitle: m.status_received_title({}, o),
    memberTitle: m.status_member_title({}, o),
    contactTitle: m.status_contact_title({}, o),
    notFound: m.status_not_found({}, o),
    registerLink: m.status_register_link({}, o),
    nameLabel: m.status_name_label({}, o),
    hbcLabel: m.status_hbc_label({}, o),
    wrongNote: m.status_wrong_note({}, o),
    checkAgain: m.status_check_again({}, o),
    helpTitle: m.reg_help_title({}, o),
    /** "… Call {phone}.", with a placeholder where the form puts the office number as a link. */
    helpBody: m.status_help_body({ phone: "{phone}" }, o),
  };
}

export type StatusText = ReturnType<typeof statusText>;
