"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon } from "@/components/icons";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const FIELDS = [
  { name: "currentPassword", label: "Current password", autoComplete: "current-password" },
  { name: "newPassword", label: "New password", autoComplete: "new-password" },
  { name: "confirmPassword", label: "New password again", autoComplete: "new-password" },
] as const;

/** Current password, then the new one twice. Nothing typed is kept after a refusal. */
export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [state, act] = useActionState<ChangePasswordState, FormData>(changePasswordAction, {});
  return (
    <form action={act} noValidate className="space-y-5">
      {FIELDS.map((f) => (
        <div key={f.name} className="space-y-2">
          <label htmlFor={f.name} className="block font-medium">
            {forced && f.name === "currentPassword" ? "Temporary password" : f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type="password"
            autoComplete={f.autoComplete}
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "password-error" : undefined}
            className="field"
          />
        </div>
      ))}
      {state.error && (
        <p
          id="password-error"
          role="alert"
          className="flex gap-2 rounded-xl bg-cloud p-4 text-error"
        >
          <AlertIcon className="mt-1" />
          <span>{state.error}</span>
        </p>
      )}
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
      className="btn-primary"
    >
      {pending && <span aria-hidden="true" className="spinner" />}
      Change password
    </button>
  );
}
