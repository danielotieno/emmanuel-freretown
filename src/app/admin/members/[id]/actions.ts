"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { getLogger } from "@/app/_lib/log";
import { requireStaff } from "@/app/_lib/staff";
import {
  changeMemberStatus,
  editMemberDetails,
  transferMemberHbc,
  type MemberChangeRefusal,
  type MemberChangeResult,
  type MemberDetailsFields,
  type MemberFieldError,
} from "@/modules/membership";

/**
 * A Membership Administrator changes a member record (FR-6, #22): the details, the HBC or the
 * status, each with a reason. Every action checks the staff session and role first (CLAUDE.md
 * rule 1; a Super Administrator qualifies); the membership module checks everything else.
 * Staff screens are English-only in Release 1 (NFR-5).
 */

export interface MemberFormState {
  /** A message for the whole form. */
  error?: string;
  errors?: Partial<Record<string, string>>;
  /** What was entered, shown again after a refusal so nothing has to be typed twice. */
  values?: Record<string, string | boolean | string[]>;
}

const REFUSALS: Record<Exclude<MemberChangeRefusal, "invalid">, string> = {
  not_found: "This member record no longer exists.",
  stale:
    "Someone else changed this record since you opened it. Its latest state is shown: check it and try again.",
  closed: "This member is deceased or transferred out, so the record can't be changed.",
  unchanged: "Nothing would change. Change something, or leave the form.",
  units: "The HBC or a department chosen is no longer available. Choose another (BR-04).",
  phone_held:
    "This mobile number belongs to another member (D20). Each member needs a number of their own; agree with both who keeps it (D28).",
};

const FIELD_MESSAGES: Record<string, Partial<Record<MemberFieldError, string>>> = {
  fullName: {
    required: "Enter the member's full name.",
    too_short: "The name must be at least 2 characters.",
    too_long: "The name must be 120 characters or fewer.",
    invalid: "Remove the unusual characters from the name.",
  },
  phone: {
    required: "Enter the member's mobile number, or tick No personal phone.",
    invalid: "Enter a Kenyan mobile number, such as 0712 345 678.",
  },
  language: { required: "Choose the SMS language." },
  hbcId: { required: "Choose the new HBC." },
  status: { required: "Choose the new status." },
  confirmFinal: {
    required: "Tick to confirm this is the right member: deceased and transferred out are final.",
  },
  reason: {
    required: "Give the reason for this change.",
    too_short: "The reason must be at least 3 characters.",
    too_long: "The reason must be 500 characters or fewer.",
    invalid: "Remove the unusual characters from the reason.",
  },
};

function text(form: FormData, name: string, max = 500): string {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, max) : "";
}

async function common(form: FormData) {
  return {
    memberId: text(form, "memberId", 64),
    version: Number.isInteger(Number(form.get("version"))) ? Number(form.get("version")) : -1,
    reason: text(form, "reason", 600),
    requestId: (await headers()).get("x-request-id") ?? undefined,
  };
}

/** Turns the module's answer into the form's state, or goes back to the record on success. */
async function answer(
  result: MemberChangeResult<string>,
  memberId: string,
  done: string,
  values: MemberFormState["values"],
): Promise<MemberFormState> {
  const log = await getLogger();
  if (!result.ok) {
    log.info("member.change_refused", { change: done, reason: result.reason });
    if (result.reason === "invalid") {
      const errors: MemberFormState["errors"] = {};
      for (const [field, code] of Object.entries(result.errors)) {
        errors[field] = (code && FIELD_MESSAGES[field]?.[code]) ?? "Check this answer.";
      }
      return { error: "Some details need attention.", errors, values };
    }
    if (result.reason === "stale") {
      // Show the latest record, not what was typed over the old one: the details form posts
      // every field, so saving the old values again would undo the other change. Only the
      // reason is kept.
      refresh();
      return { error: REFUSALS.stale, values: { reason: String(values?.reason ?? "") } };
    }
    return { error: REFUSALS[result.reason], values };
  }
  log.info("member.changed", { change: done });
  // Back to the record, saying only what happened (rule 2).
  redirect(`/members/${memberId}?done=${done}`);
}

export async function editDetailsAction(
  _previous: MemberFormState,
  form: FormData,
): Promise<MemberFormState> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const { memberId, version, reason, requestId } = await common(form);
  const fields: MemberDetailsFields = {
    fullName: text(form, "fullName"),
    noPersonalPhone: form.get("noPersonalPhone") === "on",
    phone: text(form, "phone"),
    language: text(form, "language", 4),
    departmentIds: form
      .getAll("departmentIds")
      .filter((d): d is string => typeof d === "string")
      .slice(0, 50),
  };
  const result = await editMemberDetails(await getDb(), {
    memberId,
    version,
    fields,
    reason,
    actor: { type: "STAFF", userId: staff.userId },
    requestId,
  });
  return answer(result, memberId, "details", { ...fields, reason });
}

export async function transferHbcAction(
  _previous: MemberFormState,
  form: FormData,
): Promise<MemberFormState> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const { memberId, version, reason, requestId } = await common(form);
  const hbcId = text(form, "hbcId", 64);
  const result = await transferMemberHbc(await getDb(), {
    memberId,
    version,
    hbcId,
    reason,
    actor: { type: "STAFF", userId: staff.userId },
    requestId,
  });
  return answer(result, memberId, "hbc", { hbcId, reason });
}

export async function changeStatusAction(
  _previous: MemberFormState,
  form: FormData,
): Promise<MemberFormState> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const { memberId, version, reason, requestId } = await common(form);
  const status = text(form, "status", 20);
  const confirmFinal = form.get("confirmFinal") === "on";
  const result = await changeMemberStatus(await getDb(), {
    memberId,
    version,
    status,
    reason,
    confirmFinal,
    actor: { type: "STAFF", userId: staff.userId },
    requestId,
  });
  return answer(result, memberId, "status", { status, reason, confirmFinal });
}
