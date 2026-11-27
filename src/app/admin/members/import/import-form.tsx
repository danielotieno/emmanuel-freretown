"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon } from "@/components/icons";
import type { ImportProblem } from "@/modules/membership";
import { importAction } from "./actions";
import { INITIAL_IMPORT_STATE } from "./state";

/** Each rule a skipped row breaks, in plain words. Never a value from the row (rule 2). */
const PROBLEMS: Record<ImportProblem, string> = {
  fwo_missing: "No FWO number",
  fwo_invalid: "FWO number is not digits only (BR-01)",
  fwo_held: "FWO number already belongs to a member (BR-02)",
  fwo_repeated: "FWO number is on another row of the file too",
  name_missing: "No name",
  name_too_short: "Name is shorter than 2 characters",
  name_too_long: "Name is longer than 120 characters",
  phone_invalid: "Phone is not a Kenyan mobile number",
  phone_held: "Phone already belongs to a member (BR-06)",
  phone_repeated: "Phone is on another row of the file too",
  hbc_missing: "No HBC",
  hbc_unknown: "HBC is not one of the active HBCs",
  department_unknown: "A department is not one of the active departments",
  language_invalid: "Language is not en, sw or blank",
  extra_cells: "More cells than column headings: is there a comma in a name without quotes?",
};

/**
 * Import of the parish list (FR-13, D47): upload, preview, confirm. Plain forms posting to one
 * server action; nothing is stored until the administrator confirms.
 */
export function ImportForm() {
  const [state, action] = useActionState(importAction, INITIAL_IMPORT_STATE);

  if (state.step === "done") {
    return (
      <section aria-labelledby="result-heading" className="mt-8 space-y-6">
        <p role="status" className="flex gap-3 rounded-xl bg-mist p-4">
          <CheckIcon size="size-5" />
          <span id="result-heading">
            Imported {plural(state.imported, "member")}. {plural(state.skipped, "row")} skipped.
          </span>
        </p>
        <p className="text-ink-muted">
          Imported members get no SMS. They can check their record at /registration/status.
        </p>
        <form action={action}>
          <Submit intent="restart" className="btn-secondary">
            Import another file
          </Submit>
        </form>
      </section>
    );
  }

  if (state.step === "upload") {
    return (
      <form action={action} className="mt-8 space-y-5">
        <ErrorBox message={state.error} detail={state.detail} />
        <div className="space-y-2">
          <label htmlFor="file" className="text-subtitle">
            The parish list, as a CSV file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full rounded-xl border border-line bg-paper p-3"
          />
        </div>
        <Submit intent="preview" className="btn-primary">
          Check the file
        </Submit>
      </form>
    );
  }

  const { toImport, skipped } = state;
  return (
    <div className="mt-8 space-y-8">
      <ErrorBox message={state.error} />
      <section aria-labelledby="preview-heading" className="space-y-4">
        <h2 id="preview-heading" className="text-subtitle">
          Preview
        </h2>
        <p>
          <strong>{plural(toImport, "row")}</strong> will be imported as members.{" "}
          <strong>{plural(skipped.length, "row")}</strong> will be skipped.
        </p>
        {skipped.length > 0 && (
          <>
            <p className="text-ink-muted">
              Skipped rows are not imported. Fix them in the spreadsheet and import them later in a
              file of their own.
            </p>
            <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
              <table className="w-full text-left">
                <caption className="sr-only">Skipped rows and why</caption>
                <thead className="border-b border-line text-small text-ink-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Row
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Why it is skipped
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {skipped.map((row) => (
                    <tr key={row.rowNumber}>
                      <td className="px-4 py-3 align-top tabular-nums">{row.rowNumber}</td>
                      <td className="px-4 py-3">
                        <ul className="space-y-1">
                          {row.problems.map((p) => (
                            <li key={p}>{PROBLEMS[p]}</li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {toImport > 0 ? (
        <form
          action={action}
          className="space-y-5 rounded-2xl border border-line bg-paper p-5 sm:p-6"
        >
          <h2 className="text-subtitle">Confirm the import</h2>
          <input type="hidden" name="text" value={state.text} />
          <input type="hidden" name="digest" value={state.digest} />
          <input type="hidden" name="expectedCount" value={toImport} />
          <div className="space-y-2">
            <label htmlFor="consentConfirmedOn" className="block">
              Date the Vicar confirmed the members&apos; consent
            </label>
            <FieldError id="consentConfirmedOn-error" message={state.consentDateError} />
            <input
              id="consentConfirmedOn"
              name="consentConfirmedOn"
              type="date"
              required
              aria-invalid={state.consentDateError ? true : undefined}
              aria-describedby="consentConfirmedOn-error"
              className="field max-w-[16rem]"
            />
          </div>
          <div className="space-y-1.5">
            <FieldError id="consentGiven-error" message={state.consentGivenError} />
            <label className="option">
              <input
                type="checkbox"
                name="consentGiven"
                aria-invalid={state.consentGivenError ? true : undefined}
                aria-describedby="consentGiven-error"
                className="mt-1 size-5 shrink-0 accent-brand"
              />
              <span>
                The Vicar has confirmed that the members on this list consented to their details
                being stored outside Kenya, and how they consented is recorded in the DPIA (BR-15,
                D47).
              </span>
            </label>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-end">
            <Submit intent="confirm" className="btn-primary">
              Import {plural(toImport, "member")}
            </Submit>
            <Submit intent="restart" className="btn-secondary" formNoValidate>
              Start again
            </Submit>
          </div>
        </form>
      ) : (
        <form action={action}>
          <p className="mb-4">No row can be imported. Fix the rows above and upload again.</p>
          <Submit intent="restart" className="btn-secondary">
            Start again
          </Submit>
        </form>
      )}
    </div>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function Submit(props: {
  intent: string;
  className: string;
  formNoValidate?: boolean;
  children: ReactNode;
}) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("intent") === props.intent;
  return (
    <button
      type="submit"
      name="intent"
      value={props.intent}
      disabled={pending}
      aria-busy={mine || undefined}
      formNoValidate={props.formNoValidate}
      className={props.className}
    >
      {mine && <span aria-hidden="true" className="spinner" />}
      {props.children}
    </button>
  );
}

function ErrorBox({ message, detail }: { message?: string; detail?: string[] }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-xl border border-error/40 bg-error/5 p-4 text-error"
    >
      <AlertIcon className="mt-1" />
      <div>
        <p>{message}</p>
        {detail?.map((d) => (
          <p key={d} className="mt-1">
            {d}
          </p>
        ))}
      </div>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} className="flex gap-2 text-error empty:hidden">
      {message && (
        <>
          <AlertIcon className="mt-1" />
          <span>{message}</span>
        </>
      )}
    </p>
  );
}
