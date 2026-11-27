"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, CheckIcon } from "@/components/icons";
import { setHighestAction } from "./actions";

/** Record or change the highest FWO number ever issued (D30). */
export function SettingForm({ current }: { current: string | null }) {
  const [state, action] = useActionState(setHighestAction, {});
  return (
    <form action={action} noValidate className="space-y-4">
      {state.done && (
        <p role="status" className="flex gap-3 rounded-xl bg-mist p-4">
          <CheckIcon size="size-5" />
          <span>Saved.</span>
        </p>
      )}
      <div className="space-y-2">
        <label htmlFor="highestIssued" className="block">
          Highest FWO number ever issued
        </label>
        <p id="highestIssued-hint" className="text-small text-ink-muted">
          Check the envelope records. Every number issued from now on is entered on the new
          member&apos;s registration, which raises this automatically.
        </p>
        {state.error && (
          <p id="highestIssued-error" className="flex gap-2 text-error">
            <AlertIcon className="mt-1" />
            <span>{state.error}</span>
          </p>
        )}
        <input
          id="highestIssued"
          name="highestIssued"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={current ?? ""}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={`highestIssued-hint${state.error ? " highestIssued-error" : ""}`}
          className="field max-w-[14rem] tabular-nums"
        />
      </div>
      <Submit />
    </form>
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
      Save
    </button>
  );
}
