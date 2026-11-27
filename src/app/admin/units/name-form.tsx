"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon } from "@/components/icons";
import type { UnitKind } from "@/modules/organisation";
import { addUnitAction, renameUnitAction, type UnitFormState } from "./actions";

/**
 * Adds a unit, or renames one when `unit` is given (FR-9). A plain form posting to a server
 * action, so it works before the page's JavaScript runs; after a refusal the typed name stays.
 */
export function NameForm(props: {
  kind: UnitKind;
  /** The unit to rename; omitted to add one. */
  unit?: { id: string; name: string };
  label: string;
  submit: ReactNode;
}) {
  const [state, act] = useActionState<UnitFormState, FormData>(
    props.unit ? renameUnitAction : addUnitAction,
    {},
  );
  const id = `${props.kind}-${props.unit?.id ?? "new"}-name`;
  return (
    <form action={act} noValidate className="space-y-3">
      <input type="hidden" name="kind" value={props.kind} />
      {props.unit && <input type="hidden" name="id" value={props.unit.id} />}
      <label htmlFor={id} className="block text-ink">
        {props.label}
      </label>
      <p id={`${id}-error`} className="flex gap-2 text-error empty:hidden">
        {state.error && (
          <>
            <AlertIcon className="mt-1" />
            <span>{state.error}</span>
          </>
        )}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={id}
          name="name"
          // After a refusal React resets the form to its defaults: make that what was typed.
          key={state.value ?? props.unit?.name ?? ""}
          defaultValue={state.value ?? props.unit?.name ?? ""}
          maxLength={80}
          autoComplete="off"
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `${id}-error` : undefined}
          className="field sm:flex-1"
        />
        <Submit>{props.submit}</Submit>
      </div>
    </form>
  );
}

function Submit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="btn-secondary shrink-0"
    >
      {pending && <span aria-hidden="true" className="spinner" />}
      {children}
    </button>
  );
}
