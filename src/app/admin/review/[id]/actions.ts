"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { getDb, getDbOpener } from "@/app/_lib/db";
import { getEnv, jobQueue, smsProvider } from "@/app/_lib/env";
import { getLogger } from "@/app/_lib/log";
import { requireStaff } from "@/app/_lib/staff";
import { sendNow } from "@/modules/notifications";
import {
  approveRegistration,
  checkReason,
  rejectRegistration,
  requestCorrection,
  type DecisionRefusal,
  type DecisionResult,
} from "@/modules/registration";

/**
 * The administrator's decisions on a registration (FR-4, #19). Each action checks the staff
 * session and the Membership Administrator role first (CLAUDE.md rule 1; a Super Administrator
 * also qualifies). The registration module enforces the rest: the version the reviewer saw,
 * BR-10, BR-16 and the conflicts. Staff screens are English-only in Release 1 (NFR-5).
 */

export interface DecisionState {
  /** A message for the whole form. */
  error?: string;
  /** A message for the reason field. */
  reasonError?: string;
}

/** Plain messages for each refusal: never a raw database error (FR-4). */
const REFUSALS: Record<DecisionRefusal, string> = {
  not_found: "This registration no longer exists.",
  stale:
    "Someone else acted on this registration first, or it changed since you opened it. Its latest state is shown below.",
  captured_by_you:
    "You captured this registration, so you can't approve it. A Super Administrator must approve it (BR-10, D36).",
  no_fwo:
    "This new member has no FWO number yet. The Church Secretary must issue one and enter it before approval (BR-16).",
  no_hbc:
    "This new member's HBC isn't set yet: the Church Secretary sets it with the FWO number before approval (BR-04, D49).",
  fwo_held:
    "This FWO number already belongs to a member. Reject this registration with a reason; if the member's details have changed, edit the member record instead (D33).",
  fwo_in_open_registration:
    "Another registration waiting for review has this FWO number. Compare the two and reject the duplicate with a reason first (BR-03, D33).",
  phone_held:
    "This phone number belongs to another member. Call both people to agree who keeps it (D28), have the registration corrected, then approve.",
  phone_in_open_registration:
    "Another registration waiting for review has this phone number. Call both people to agree who keeps it (D28), have the other one corrected or rejected, then approve.",
  units: "The HBC or a department on this registration has been deactivated. Ask for a correction.",
};

const DONE = { approve: "approved", reject: "rejected", correction: "correction" } as const;

function readDecision(form: FormData) {
  const id = form.get("registrationId");
  const version = Number(form.get("version"));
  return {
    registrationId: typeof id === "string" ? id : "",
    version: Number.isInteger(version) ? version : -1,
  };
}

/** Sends the SMS after the response, then returns to the queue; or explains a refusal. */
async function finish(result: DecisionResult, kind: keyof typeof DONE): Promise<DecisionState> {
  const log = await getLogger();
  if (!result.ok) {
    log.info("review.refused", { kind, reason: result.reason });
    // Show the registration as it is now, beside the message.
    if (result.reason === "stale") refresh();
    return { error: REFUSALS[result.reason] };
  }
  log.info("review.decided", { kind, sms: result.smsId !== null });
  if (result.smsId) {
    const smsId = result.smsId;
    const env = await getEnv();
    const openDb = await getDbOpener();
    const provider = smsProvider(env);
    const jobs = jobQueue(env);
    after(() =>
      sendNow(openDb, smsId, { provider, jobs }).catch((error: unknown) =>
        log.error("review.sms_failed", error),
      ),
    );
  }
  // No reference or name in the URL (rule 2): only what happened.
  redirect(`/review?done=${DONE[kind]}`);
}

async function requestIdOf(): Promise<string | undefined> {
  return (await headers()).get("x-request-id") ?? undefined;
}

export async function approveAction(_: DecisionState, form: FormData): Promise<DecisionState> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const result = await approveRegistration(await getDb(), {
    ...readDecision(form),
    actor: { type: "STAFF", userId: staff.userId },
    requestId: await requestIdOf(),
  });
  return finish(result, "approve");
}

function reasonOf(form: FormData): { ok: true; value: string } | { ok: false; message: string } {
  const raw = form.get("reason");
  const reason = checkReason(typeof raw === "string" ? raw.slice(0, 1000) : "");
  if (reason.ok) return reason;
  return {
    ok: false,
    message:
      reason.error === "too_long"
        ? "Please keep the reason under 500 characters."
        : "Please give a reason of at least 3 characters.",
  };
}

export async function rejectAction(_: DecisionState, form: FormData): Promise<DecisionState> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const reason = reasonOf(form);
  if (!reason.ok) return { reasonError: reason.message };
  const result = await rejectRegistration(await getDb(), {
    ...readDecision(form),
    reason: reason.value,
    actor: { type: "STAFF", userId: staff.userId },
    requestId: await requestIdOf(),
  });
  return finish(result, "reject");
}

export async function correctionAction(_: DecisionState, form: FormData): Promise<DecisionState> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const reason = reasonOf(form);
  if (!reason.ok) return { reasonError: reason.message };
  const result = await requestCorrection(await getDb(), {
    ...readDecision(form),
    reason: reason.value,
    actor: { type: "STAFF", userId: staff.userId },
    requestId: await requestIdOf(),
  });
  return finish(result, "correction");
}
