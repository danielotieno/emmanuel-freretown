"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon } from "@/components/icons";
import { issueFwoAction } from "./fwo-actions";

/**
 * Enter the FWO number the Church Secretary issued to this new member (BR-16), with D30's
 * suggestion filled in. Saving adds a revision; the registration can then be approved.
 */
export function IssueFwoForm(props: {
  registrationId: string;
  version: number;
  /** Null until the highest FWO number ever issued is recorded (D30). */
  suggestion: string | null;
  /** The privacy notice changed since the member consented: they must agree again (D35). */
  noticeChanged: boolean;
  /**
   * The active HBCs to choose from when the member didn't know theirs (D49); null when the
   * registration has one already.
   */
  hbcs: { id: string; name: string }[] | null;
}) {
  const [state, action] = useActionState(issueFwoAction, {});
  // After a refusal React resets the form to its defaults: make those what was entered, never
  // the suggestion again (#124).
  const values = state.values ?? {
    fwoNumber: props.suggestion ?? "",
    hbcId: "",
    consentToCurrentNotice: false,
  };
  return (
    <section aria-labelledby="fwo-heading" className="mt-10">
      <h2 id="fwo-heading" className="text-subtitle">
        {props.hbcs ? "Issue an FWO number and set the HBC" : "Issue an FWO number"}
      </h2>
      <div className="in-card mt-3 space-y-4 rounded-2xl border border-line bg-paper p-5 sm:p-6">
        {state.error && (
          <p
            role="alert"
            className="flex gap-3 rounded-xl border border-error/40 bg-error/5 p-4 text-error"
          >
            <AlertIcon className="mt-1" />
            <span>{state.error}</span>
          </p>
        )}
        {props.suggestion === null ? (
          <p className="flex gap-3 rounded-xl bg-mist p-4">
            <AlertIcon className="mt-1 text-error" />
            <span>
              Record the highest FWO number ever issued first, on the <a href="/fwo">FWO numbers</a>{" "}
              page. Without it the suggestion could reuse an old number (D2, D30).
            </span>
          </p>
        ) : (
          <form action={action} noValidate className="space-y-4">
            <input type="hidden" name="registrationId" value={props.registrationId} />
            <input type="hidden" name="version" value={props.version} />
            <p className="text-ink-muted">
              Meet the member, issue their number as you do today, and enter it here. The suggestion
              is the next number above the highest ever issued (D30); you may enter another number
              that is not in use.
            </p>
            <div className="space-y-2">
              <label htmlFor="fwoNumber" className="block">
                FWO number issued
              </label>
              <input
                id="fwoNumber"
                name="fwoNumber"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={values.fwoNumber}
                className="field max-w-[14rem] tabular-nums"
              />
            </div>
            {props.hbcs && (
              <div className="space-y-2">
                <label htmlFor="hbcId" className="block">
                  HBC
                </label>
                <p id="hbcId-hint" className="text-small text-ink-muted">
                  The member didn&apos;t know their HBC when they registered (D49). Agree it with
                  them now.
                </p>
                <select
                  id="hbcId"
                  name="hbcId"
                  defaultValue={values.hbcId}
                  aria-describedby="hbcId-hint"
                  className="field max-w-[20rem] cursor-pointer"
                >
                  <option value="">Choose an HBC</option>
                  {props.hbcs.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {props.noticeChanged && (
              <label className="option">
                <input
                  type="checkbox"
                  name="consentToCurrentNotice"
                  defaultChecked={values.consentToCurrentNotice}
                  className="mt-1 size-5 shrink-0 accent-brand"
                />
                <span>
                  The privacy notice has changed since this member registered. I have shown them the
                  current notice, and they agree to it and to their details being stored outside
                  Kenya (BR-15, D35).
                </span>
              </label>
            )}
            <Submit />
          </form>
        )}
      </div>
    </section>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="btn-primary w-full sm:w-auto"
    >
      {pending && <span aria-hidden="true" className="spinner" />}
      Enter FWO number
    </button>
  );
}
