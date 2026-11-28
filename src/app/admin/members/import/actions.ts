"use server";

import { headers } from "next/headers";
import { getDb } from "@/app/_lib/db";
import { getLogger } from "@/app/_lib/log";
import { requireStaff } from "@/app/_lib/staff";
import {
  decodeCsvFile,
  IMPORT_MAX_BYTES,
  previewImport,
  type ImportFileError,
  type ImportPreview,
} from "@/modules/membership";
import { importParishList } from "@/modules/registration";
import type { ImportState } from "./state";

/**
 * The import of the parish list (FR-13, D47, #104): one action for its three posts. Preview
 * reads the uploaded file in memory and shows what would be imported; confirm imports the text
 * the preview returned, with its digest, the count the administrator saw and the Vicar's consent
 * confirmation; restart clears the page. Only a Membership Administrator (or a Super
 * Administrator) may use it, checked first (CLAUDE.md rule 1). Logs carry counts and outcomes,
 * never the file or a row (rule 2). Staff screens are English-only in Release 1 (NFR-5).
 */
export async function importAction(previous: ImportState, form: FormData): Promise<ImportState> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const intent = form.get("intent");
  const log = await getLogger();
  if (intent === "restart") return { step: "upload" };
  if (intent === "confirm") return confirm(previous, form, staff.userId);

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { step: "upload", error: "Choose the CSV file to import." };
  }
  if (file.size > IMPORT_MAX_BYTES) {
    return { step: "upload", error: "This file is larger than 512 KB. Is it the right file?" };
  }
  const text = decodeCsvFile(new Uint8Array(await file.arrayBuffer()));
  if (text === null) {
    return {
      step: "upload",
      error:
        "This file isn't saved as UTF-8. In Excel, save it again as “CSV UTF-8 (Comma delimited)”.",
    };
  }
  const preview = await previewImport(await getDb(), text);
  log.info("member_import.previewed", previewOutcome(preview));
  return previewState(text, preview);
}

async function confirm(
  previous: ImportState,
  form: FormData,
  userId: string,
): Promise<ImportState> {
  const log = await getLogger();
  const digest = String(form.get("digest") ?? "");
  const expectedCount = Number(form.get("expectedCount"));
  const consentConfirmedOn = String(form.get("consentConfirmedOn") ?? "");
  const consentGiven = form.get("consentGiven") === "on";

  // The text comes from the preview's state, not a form field: a browser rewrites line ends in
  // posted fields, and the digest must match the text previewed exactly.
  const back = previous.step === "preview" ? previous : null;
  if (!back || back.digest !== digest) {
    return {
      step: "upload",
      error: "Upload the file again and check the preview before importing.",
    };
  }
  const consentDateError = checkConsentDate(consentConfirmedOn);
  const consentGivenError = consentGiven
    ? undefined
    : "Tick this to confirm the Vicar's confirmation of the members' consent (BR-15, D47).";
  if (consentDateError || consentGivenError) {
    return { ...back, error: undefined, consentDateError, consentGivenError };
  }

  const requestId = (await headers()).get("x-request-id") ?? undefined;
  const text = back.text;
  const result = await importParishList(await getDb(), {
    text,
    digest,
    expectedCount: Number.isInteger(expectedCount) ? expectedCount : -1,
    consentConfirmedOn,
    actor: { type: "STAFF", userId },
    requestId,
  });
  if (result.ok) {
    log.info("member_import.imported", { imported: result.imported, skipped: result.skipped });
    return { step: "done", imported: result.imported, skipped: result.skipped };
  }
  log.info("member_import.refused", { reason: result.reason });
  switch (result.reason) {
    case "file_changed":
      return { step: "upload", error: "The file changed after the preview. Upload it again." };
    case "file":
      return {
        step: "upload",
        error: "This file can't be read.",
        detail: fileErrorDetail(result.error),
      };
    case "nothing_to_import":
      return {
        ...previewState(text, result.preview),
        error: "No row can be imported now. Fix the rows below and upload again.",
      };
    case "registry_changed":
      return {
        ...previewState(text, result.preview),
        error:
          "The register changed since the preview (a member was added). Here is the new preview: check it and confirm again.",
      };
  }
}

function previewState(
  text: string,
  preview: ImportPreview,
): Exclude<ImportState, { step: "done" }> {
  if (!preview.ok) {
    return {
      step: "upload",
      error: "This file can't be read.",
      detail: fileErrorDetail(preview.error),
    };
  }
  return {
    step: "preview",
    text,
    digest: preview.digest,
    toImport: preview.toImport,
    skipped: preview.skipped,
  };
}

function previewOutcome(preview: ImportPreview) {
  return preview.ok
    ? { outcome: "ok", toImport: preview.toImport, skipped: preview.skipped.length }
    : { outcome: preview.error.kind };
}

function fileErrorDetail(error: ImportFileError): string[] {
  switch (error.kind) {
    case "unclosed_quote":
      return ["A quotation mark is opened and never closed. Save the file again from Excel."];
    case "empty":
      return ["The file has no rows under its column headings."];
    case "missing_columns":
      return [`These column headings are missing: ${error.columns.join(", ")}.`];
    case "repeated_columns":
      return [`These column headings appear more than once: ${error.columns.join(", ")}.`];
    case "too_many_rows":
      return [`The file has more than ${error.limit} rows. Is it the right file?`];
  }
}

/** The Vicar's confirmation date: a real date, not in the future (Africa/Nairobi). */
function checkConsentDate(value: string): string | undefined {
  // Round-tripped, because Date.parse accepts 31 February and moves it into March.
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return "Enter the date the Vicar confirmed the members' consent.";
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" }).format(new Date());
  return value > today ? "The date can't be in the future." : undefined;
}
