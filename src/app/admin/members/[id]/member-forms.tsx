"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, ChevronIcon, PlusIcon } from "@/components/icons";
import {
  changeStatusAction,
  editDetailsAction,
  transferHbcAction,
  type MemberFormState,
} from "./actions";

/**
 * Status reasons are kept after D45 removes a closed record's details, and every reason sits in
 * the audit log, so they must not repeat names or numbers.
 */
const KEPT =
  "Don't write names, phone or FWO numbers here: the reason is kept in the audit log, and a status reason is kept after the member's details are removed (D45).";

/**
 * The three changes to a member record (FR-6): the details, the HBC and the status, each with a
 * reason. Plain forms posting to server actions, so they work before the page's JavaScript runs.
 * Each carries the version the administrator saw: if the record changed since, the action fails
 * and says so.
 */
export function MemberForms(props: {
  memberId: string;
  version: number;
  current: {
    fullName: string;
    noPersonalPhone: boolean;
    /** As stored, +254…; the form accepts it as it is, or in the local form (0712…). */
    phone: string;
    language: "en" | "sw";
    departmentIds: string[];
    hbcId: string;
  };
  /** The statuses the lifecycle allows from here. */
  statuses: { value: string; name: string }[];
  /** Active HBCs other than the current one. */
  hbcs: { id: string; name: string }[];
  /** Active departments, and any the member already belongs to. */
  departments: { id: string; name: string }[];
}) {
  const [edited, edit] = useActionState(editDetailsAction, {});
  const [moved, move] = useActionState(transferHbcAction, {});
  const [changed, change] = useActionState(changeStatusAction, {});
  const hidden = (
    <>
      <input type="hidden" name="memberId" value={props.memberId} />
      <input type="hidden" name="version" value={props.version} />
    </>
  );
  // After a refusal React resets a form to its defaults: make those what was entered.
  const details = edited.values ?? props.current;
  const text = (state: MemberFormState, name: string, fallback = "") => {
    const value = state.values?.[name];
    return typeof value === "string" ? value : fallback;
  };

  return (
    <section aria-labelledby="change-heading" className="mt-10">
      <h2 id="change-heading" className="text-subtitle">
        Change the record
      </h2>
      <p className="mt-2 text-ink-muted">
        Every change needs a reason and is recorded with your name. No SMS is sent.
      </p>
      <div className="in-card mt-3 space-y-4 rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <Change id="details" title="Correct the details" state={edited}>
          <form action={edit} noValidate className="space-y-5 pb-4">
            {hidden}
            <ErrorBox message={edited.error} />
            <Field id="fullName" label="Full name" error={edited.errors?.fullName}>
              <input
                id="fullName"
                name="fullName"
                defaultValue={String(details.fullName ?? "")}
                maxLength={120}
                autoComplete="off"
                {...described("fullName", edited)}
                className="field"
              />
            </Field>
            <Field
              id="phone"
              label="Mobile number"
              hint="The member's own number (BR-06). Leave it empty if you tick No personal phone."
              error={edited.errors?.phone}
            >
              <input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={String(details.phone ?? "")}
                inputMode="tel"
                autoComplete="off"
                {...described("phone", edited)}
                className="field max-w-[16rem] tabular-nums"
              />
              <label className="option">
                <input
                  type="checkbox"
                  name="noPersonalPhone"
                  defaultChecked={details.noPersonalPhone === true}
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
            <Field id="language" label="SMS language" error={edited.errors?.language}>
              <SelectBox
                id="language"
                name="language"
                value={String(details.language ?? "en")}
                state={edited}
              >
                <option value="en">English</option>
                <option value="sw">Kiswahili</option>
              </SelectBox>
            </Field>
            <fieldset aria-describedby="departmentIds-hint" className="space-y-2">
              <legend className="text-ink">Departments</legend>
              <p id="departmentIds-hint" className="text-ink-muted">
                Optional. A department added is recorded as declared (BR-05).
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {props.departments.map((d) => (
                  <label key={d.id} className="option items-center">
                    <input
                      type="checkbox"
                      name="departmentIds"
                      value={d.id}
                      defaultChecked={(details.departmentIds as string[] | undefined)?.includes(
                        d.id,
                      )}
                      className="size-5 shrink-0 accent-brand"
                    />
                    {d.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <Reason id="details" state={edited} />
            <Submit>Save the details</Submit>
          </form>
        </Change>

        <Change id="hbc" title="Move to another HBC" state={moved}>
          <form action={move} noValidate className="space-y-5 pb-4">
            {hidden}
            <ErrorBox message={moved.error} />
            <p className="text-ink-muted">
              The current HBC is kept in the history, ending now; the new one starts at the same
              moment (BR-04).
            </p>
            <Field id="hbcId" label="New HBC" error={moved.errors?.hbcId}>
              <SelectBox id="hbcId" name="hbcId" value={text(moved, "hbcId")} state={moved}>
                <option value="">Choose an HBC</option>
                {props.hbcs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </SelectBox>
            </Field>
            <Reason id="hbc" state={moved} />
            <Submit>Move to this HBC</Submit>
          </form>
        </Change>

        <Change id="status" title="Change the status" state={changed}>
          <form action={change} noValidate className="space-y-5 pb-4">
            {hidden}
            <ErrorBox message={changed.error} />
            <p className="text-ink-muted">
              Deceased and transferred out are final: the record can no longer be changed, and the
              member&apos;s mobile number becomes free for another member (D20).
            </p>
            <Field id="status" label="New status" error={changed.errors?.status}>
              <SelectBox id="status" name="status" value={text(changed, "status")} state={changed}>
                <option value="">Choose a status</option>
                {props.statuses.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.name}
                  </option>
                ))}
              </SelectBox>
            </Field>
            <Reason id="status" state={changed} />
            <Submit>Change the status</Submit>
          </form>
        </Change>
      </div>
    </section>
  );
}

function described(field: string, state: MemberFormState) {
  return {
    "aria-invalid": state.errors?.[field] ? true : undefined,
    "aria-describedby": `${field}-hint ${field}-error`,
  } as const;
}

/** One change, folded until opened; open after a refusal so its message shows. */
function Change(props: { id: string; title: string; state: MemberFormState; children: ReactNode }) {
  return (
    <details
      data-change={props.id}
      className="group/change rounded-xl border border-line bg-cloud px-4"
      open={!!props.state.error || undefined}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-ink [&::-webkit-details-marker]:hidden">
        {props.title}
        <PlusIcon className="text-brand transition-transform duration-200 group-open/change:rotate-45" />
      </summary>
      {props.children}
    </details>
  );
}

function Reason({ id, state }: { id: string; state: MemberFormState }) {
  const field = `${id}-reason`;
  const error = state.errors?.reason;
  const value = state.values?.reason;
  return (
    <div className="space-y-2">
      <label htmlFor={field} className="block text-ink">
        Reason
      </label>
      <p id={`${field}-hint`} className="text-small text-ink-muted">
        {KEPT}
      </p>
      {error && (
        <p id={`${field}-error`} className="flex gap-2 text-error">
          <AlertIcon className="mt-1" />
          <span>{error}</span>
        </p>
      )}
      <textarea
        id={field}
        name="reason"
        rows={3}
        maxLength={500}
        defaultValue={typeof value === "string" ? value : ""}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${field}-hint${error ? ` ${field}-error` : ""}`}
        className="field min-h-24 py-3"
      />
    </div>
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

function SelectBox(props: {
  id: string;
  name: string;
  value: string;
  state: MemberFormState;
  children: ReactNode;
}) {
  return (
    <div className="relative max-w-[20rem]">
      {/* Keyed: React doesn't apply a select's new defaultValue on re-render, so a refusal
          would otherwise lose the choice (#126). */}
      <select
        key={props.value}
        id={props.id}
        name={props.name}
        defaultValue={props.value}
        {...described(props.id, props.state)}
        className="field cursor-pointer appearance-none pr-12"
      >
        {props.children}
      </select>
      <ChevronIcon className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-muted" />
    </div>
  );
}

/** A submit button with a spinner while its own form posts (DESIGN.md §8). */
function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="btn-primary w-full sm:w-auto"
    >
      {pending && <span aria-hidden="true" className="spinner" />}
      {children}
    </button>
  );
}

function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex gap-3 rounded-xl border border-error/40 bg-error/5 p-4 text-error"
    >
      <AlertIcon className="mt-1" />
      <span>{message}</span>
    </p>
  );
}
