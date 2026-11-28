"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon } from "@/components/icons";
import { resetPasswordAction, type ResetPasswordState } from "../actions";
import { TemporaryPassword } from "../temporary-password";

/** Resets a forgotten password (#91) and shows the new temporary password once. */
export function ResetPasswordForm({ userId, name }: { userId: string; name: string }) {
  const [state, act] = useActionState<ResetPasswordState, FormData>(resetPasswordAction, {});
  if (state.temporaryPassword) {
    return <TemporaryPassword name={name} password={state.temporaryPassword} />;
  }
  return (
    <form action={act} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      {state.error && (
        <p role="alert" className="flex gap-2 text-error">
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
      className="btn-secondary"
    >
      {pending && <span aria-hidden="true" className="spinner" />}
      Reset the password
    </button>
  );
}
