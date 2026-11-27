"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { getLogger } from "@/app/_lib/log";
import { requireStaff } from "@/app/_lib/staff";
import {
  submitCorrection,
  type CorrectionFieldName,
  type CorrectionFields,
  type CorrectionRefusal,
  type FieldError,
} from "@/modules/registration";

/**
 * A Registration Officer or an administrator enters a correction (FR-5, #21). The action checks
 * the staff session and either role first (CLAUDE.md rule 1; a Super Administrator qualifies as
 * an administrator); the registration module checks everything else. Staff screens are
 * English-only in Release 1 (NFR-5).
 */

export interface CorrectionState {
  /** A message for the whole form. */
  error?: string;
  errors?: Partial<Record<CorrectionFieldName, string>>;
  /** What was entered, shown again after a refusal so nothing has to be typed twice. */
  values?: CorrectionFields & { consentToCurrentNotice: boolean };
}

const REFUSALS: Record<Exclude<CorrectionRefusal, "invalid">, string> = {
  not_found: "This registration no longer exists.",
  stale:
    "Someone else acted on this registration first, or it changed since you opened it. Its latest state is shown.",
  notice_changed:
    "The privacy notice has changed since this member registered. Confirm they agree to the current notice (D35).",
  hbc_required:
    "Choose this member's HBC. Only a new member still waiting for their FWO number may leave it to the Church Secretary (D49).",
  units: "The HBC or a department chosen is no longer available. Choose another (BR-04).",
};

const FIELD_MESSAGES: Record<CorrectionFieldName, Partial<Record<FieldError, string>>> = {
  fullName: {
    required: "Enter the member's full name.",
    too_short: "The name must be at least 2 characters.",
    too_long: "The name must be 120 characters or fewer.",
  },
  fwoNumber: {
    required: "Enter the FWO number.",
    invalid: "Use digits only (BR-01).",
  },
  phone: {
    required: "Enter the member's mobile number, or tick No personal phone.",
    invalid: "Enter a Kenyan mobile number, such as 0712 345 678.",
  },
  hbcId: { required: "Choose the HBC." },
  noPersonalPhone: {},
  hbcUnknown: {},
  departmentIds: {},
};

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, 500) : "";
}

export async function correctionAction(
  _previous: CorrectionState,
  form: FormData,
): Promise<CorrectionState> {
  const staff = await requireStaff(["REGISTRATION_OFFICER", "MEMBERSHIP_ADMIN"]);
  const id = text(form, "registrationId");
  const version = Number(form.get("version"));
  const hbc = text(form, "hbcId");
  const fields: CorrectionFields = {
    fullName: text(form, "fullName"),
    fwoNumber: text(form, "fwoNumber"),
    noPersonalPhone: form.get("noPersonalPhone") === "on",
    phone: text(form, "phone"),
    hbcId: hbc === "unknown" ? "" : hbc,
    hbcUnknown: hbc === "unknown",
    departmentIds: form
      .getAll("departmentIds")
      .filter((d): d is string => typeof d === "string")
      .slice(0, 50),
  };
  const consentToCurrentNotice = form.get("consentToCurrentNotice") === "on";
  const values = { ...fields, consentToCurrentNotice };

  const result = await submitCorrection(await getDb(), {
    registrationId: id,
    version: Number.isInteger(version) ? version : -1,
    fields,
    consentToCurrentNotice,
    actor: { type: "STAFF", userId: staff.userId },
    requestId: (await headers()).get("x-request-id") ?? undefined,
  });
  const log = await getLogger();
  if (!result.ok) {
    log.info("correction.refused", { reason: result.reason });
    if (result.reason === "invalid") {
      const errors: CorrectionState["errors"] = {};
      for (const [name, code] of Object.entries(result.errors)) {
        const field = name as CorrectionFieldName;
        errors[field] = FIELD_MESSAGES[field][code] ?? "Check this answer.";
      }
      return { error: "Some details need attention.", errors, values };
    }
    if (result.reason === "stale") refresh();
    return { error: REFUSALS[result.reason], values };
  }
  log.info("correction.saved");
  // Back to the list, saying only what happened (rule 2).
  redirect("/corrections?done=1");
}
