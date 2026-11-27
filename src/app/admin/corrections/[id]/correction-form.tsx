"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, ChevronIcon } from "@/components/icons";
import type { CorrectionFieldName } from "@/modules/registration";
import { correctionAction } from "./actions";

/**
 * The corrected details (FR-5), filled in with the current revision. Saving adds a new revision
 * (BR-09) and sends the registration back to the review queue. A plain form posting to a server
 * action, so it works before the page's JavaScript runs; it carries the version the staff member
 * saw, so a concurrent correction or decision makes it fail and say so.
 */
export function CorrectionForm(props: {
  registrationId: string;
  version: number;
  current: {
    fullName: string;
    fwoNumber: string;
    noPersonalPhone: boolean;
    /** As stored, +254…; shown in the local form. */
    phone: string;
    /** "unknown" for a new member whose HBC isn't known yet (D49). */
    hbcId: string;
    departmentIds: string[];
  };
  /** A new member: their FWO number is the Church Secretary's to issue (BR-16). */
  isNewMember: boolean;
  /** A new member still waiting for their number may leave the HBC to the Secretary (D49). */
  mayLeaveHbcUnknown: boolean;
  /** The privacy notice changed since the member consented: they must agree again (D35). */
  noticeChanged: boolean;
  hbcs: { id: string; name: string }[];
  departments: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(correctionAction, {});
  const errors = state.errors ?? {};
  // After a refusal React resets the form to its defaults: make those what was entered.
  const values = state.values
    ? {
        ...state.values,
        hbcId: state.values.hbcUnknown ? "unknown" : state.values.hbcId,
      }
    : { ...props.current, consentToCurrentNotice: false };
  const invalid = (field: CorrectionFieldName) =>
    ({
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": `${field}-hint ${field}-error`,
    }) as const;

  return (
    <section aria-labelledby="correct-heading" className="mt-10">
      <h2 id="correct-heading" className="text-subtitle">
        Enter the correction
      </h2>
      <form
        action={action}
        noValidate
        className="in-card mt-3 space-y-6 rounded-2xl border border-line bg-paper p-5 sm:p-6"
      >
        <input type="hidden" name="registrationId" value={props.registrationId} />
        <input type="hidden" name="version" value={props.version} />
        {state.error && (
          <p
            role="alert"
            className="flex gap-3 rounded-xl border border-error/40 bg-error/5 p-4 text-error"
          >
            <AlertIcon className="mt-1" />
            <span>{state.error}</span>
          </p>
        )}
        <p className="text-ink-muted">
          Check each detail with the member and change what is wrong. Saving keeps the earlier
          details as a revision and returns the registration to the review queue.
        </p>

        <Field id="fullName" label="Full name" error={errors.fullName}>
          <input
            id="fullName"
            name="fullName"
            defaultValue={values.fullName}
            maxLength={120}
            autoComplete="off"
            {...invalid("fullName")}
            className="field"
          />
        </Field>

        {props.isNewMember ? (
          <div className="space-y-2">
            <p className="text-ink">FWO number</p>
            <p className="text-ink-muted">
              {props.current.fwoNumber ? (
                <>
                  <span className="text-ink tabular-nums">{props.current.fwoNumber}</span>, issued
                  by the Church Secretary. It can&apos;t be changed here (BR-16).
                </>
              ) : (
                "None yet: a new member. The Church Secretary issues the number (BR-16)."
              )}
            </p>
          </div>
        ) : (
          <Field id="fwoNumber" label="FWO number" error={errors.fwoNumber}>
            <input
              id="fwoNumber"
              name="fwoNumber"
              defaultValue={values.fwoNumber}
              inputMode="numeric"
              autoComplete="off"
              {...invalid("fwoNumber")}
              className="field max-w-[14rem] tabular-nums"
            />
          </Field>
        )}

        <Field
          id="phone"
          label="Mobile number"
          hint="The member's own number (BR-06). Leave it empty if you tick No personal phone."
          error={errors.phone}
        >
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={values.phone}
            inputMode="tel"
            autoComplete="off"
            {...invalid("phone")}
            className="field max-w-[16rem] tabular-nums"
          />
          <label className="option">
            <input
              type="checkbox"
              name="noPersonalPhone"
              defaultChecked={values.noPersonalPhone}
              aria-describedby="noPersonalPhone-hint"
              className="mt-1 size-5 shrink-0 accent-brand"
            />
            <span>
              No personal phone
              <span id="noPersonalPhone-hint" className="mt-1 block text-ink-muted">
                The member receives no SMS and votes in person (D21).
              </span>
            </span>
          </label>
        </Field>

        <Field id="hbcId" label="HBC" error={errors.hbcId}>
          <div className="relative max-w-[20rem]">
            <select
              id="hbcId"
              name="hbcId"
              defaultValue={values.hbcId}
              {...invalid("hbcId")}
              className="field cursor-pointer appearance-none pr-12"
            >
              <option value="">Choose an HBC</option>
              {props.mayLeaveHbcUnknown && (
                <option value="unknown">Not known yet: the Church Secretary sets it (D49)</option>
              )}
              {props.hbcs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            <ChevronIcon className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-muted" />
          </div>
        </Field>

        <fieldset aria-describedby="departmentIds-hint" className="space-y-2">
          <legend className="text-ink">Departments (declared)</legend>
          <p id="departmentIds-hint" className="text-ink-muted">
            Optional. Choose every department the member belongs to (BR-05).
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {props.departments.map((d) => (
              <label key={d.id} className="option items-center">
                <input
                  type="checkbox"
                  name="departmentIds"
                  value={d.id}
                  defaultChecked={values.departmentIds.includes(d.id)}
                  className="size-5 shrink-0 accent-brand"
                />
                {d.name}
              </label>
            ))}
          </div>
        </fieldset>

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
              current notice, and they agree to it and to their details being stored outside Kenya
              (BR-15, D35).
            </span>
          </label>
        )}

        <Submit />
      </form>
    </section>
  );
}

function Field(props: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={props.id} className="block text-ink">
        {props.label}
      </label>
      {props.hint && (
        <p id={`${props.id}-hint`} className="text-ink-muted">
          {props.hint}
        </p>
      )}
      <p id={`${props.id}-error`} className="flex gap-2 text-error empty:hidden">
        {props.error && (
          <>
            <AlertIcon className="mt-1" />
            <span>{props.error}</span>
          </>
        )}
      </p>
      {props.children}
    </div>
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
      Save the correction
    </button>
  );
}
