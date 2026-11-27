"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { getLogger } from "@/app/_lib/log";
import { requireStaff } from "@/app/_lib/staff";
import { issueFwoNumber, type IssueFwoRefusal } from "@/modules/registration";

/**
 * The Church Secretary enters the FWO number they issued to a new member (BR-16, D30, #101).
 * Only a Membership Administrator (or a Super Administrator) may, checked first (CLAUDE.md
 * rule 1); the registration module checks everything else. Staff screens are English-only.
 */

export interface IssueFwoState {
  error?: string;
}

const REFUSALS: Record<IssueFwoRefusal, string> = {
  not_found: "This registration no longer exists.",
  stale:
    "Someone else acted on this registration first, or it changed since you opened it. Its latest state is shown.",
  not_waiting_for_fwo: "This registration isn't a new member waiting for an FWO number.",
  no_setting:
    "Record the highest FWO number ever issued first (FWO numbers, on the staff home page), so the suggestion can't reuse an old number (D30).",
  fwo_invalid: "Use digits only (BR-01).",
  fwo_held: "This FWO number already belongs to a member (BR-02). Issue another.",
  fwo_in_open_registration:
    "Another registration waiting for review has this FWO number (BR-03). Issue another.",
  fwo_issued_before:
    "This FWO number was issued before, to a registration since rejected or withdrawn. FWO numbers are never reused (D2). Issue another.",
  hbc_required: "Choose this member's HBC: they didn't know it when they registered (D49).",
  hbc_unavailable: "That HBC is no longer available. Choose another (BR-04).",
  notice_changed:
    "The privacy notice has changed since this member registered. Confirm they agree to the current notice (D35).",
};

export async function issueFwoAction(
  _previous: IssueFwoState,
  form: FormData,
): Promise<IssueFwoState> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const id = form.get("registrationId");
  const version = Number(form.get("version"));
  const fwoNumber = form.get("fwoNumber");
  const consentToCurrentNotice = form.get("consentToCurrentNotice") === "on";
  const hbcId = form.get("hbcId");
  const result = await issueFwoNumber(await getDb(), {
    registrationId: typeof id === "string" ? id : "",
    version: Number.isInteger(version) ? version : -1,
    fwoNumber: typeof fwoNumber === "string" ? fwoNumber : "",
    consentToCurrentNotice,
    hbcId: typeof hbcId === "string" && hbcId ? hbcId : undefined,
    actor: { type: "STAFF", userId: staff.userId },
    requestId: (await headers()).get("x-request-id") ?? undefined,
  });
  const log = await getLogger();
  if (!result.ok) {
    log.info("review.fwo_refused", { reason: result.reason });
    if (result.reason === "stale") refresh();
    return { error: REFUSALS[result.reason] };
  }
  log.info("review.fwo_issued");
  // Back to the registration with its new revision, saying so: the issue form is gone now
  // (nothing is waiting), so the confirmation is the page's, not the form's. The id is the
  // registration's uuid, already in this URL; nothing personal is added (rule 2).
  redirect(`/review/${typeof id === "string" ? id : ""}?done=fwo`);
}
