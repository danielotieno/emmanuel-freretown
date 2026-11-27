"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon } from "@/components/icons";
import type { StaffRole } from "@/modules/access";
import { ROLE_NAMES } from "../_components/role-names";
import { createStaffAction, type CreateStaffState } from "./actions";
import { TemporaryPassword } from "./temporary-password";

/**
 * Adds a staff member (FR-10, #91): their name, email address and roles. A plain form posting to
 * a server action, so it works before the page's JavaScript runs. On success it shows the
 * temporary password once; after a refusal what was typed stays.
 */
export function CreateStaffForm() {
  const [state, act] = useActionState<CreateStaffState, FormData>(createStaffAction, {});
  const errors = state.errors ?? {};
  const values = state.values ?? { name: "", email: "", roles: [] };
  // After a refusal React resets the form to its defaults: make that what was typed.
  const key = JSON.stringify(values);

  return (
    <div className="space-y-5">
      {state.created && (
        <>
          <TemporaryPassword name={state.created.name} password={state.created.temporaryPassword} />
          <p>
            <Link href={`/staff/${encodeURIComponent(state.created.userId)}`} className="btn-text">
              Open {state.created.name}&rsquo;s account
            </Link>
          </p>
        </>
      )}
      <form action={act} noValidate className="space-y-5" key={key}>
        <Field id="name" label="Full name" error={errors.name}>
          <input
            id="name"
            name="name"
            defaultValue={values.name}
            maxLength={200}
            autoComplete="off"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "name-error" : undefined}
            className="field"
          />
        </Field>
        <Field id="email" label="Email address" error={errors.email}>
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={values.email}
            maxLength={254}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "email-error" : "email-hint"}
            className="field"
          />
        </Field>
        <p id="email-hint" className="-mt-3 text-small text-ink-muted">
          The address they use for Cloudflare Access: add it to the allow-list too.
        </p>
        <fieldset className="space-y-2" aria-describedby={errors.roles ? "roles-error" : undefined}>
          <legend className="font-medium">Roles</legend>
          <ErrorText id="roles-error" message={errors.roles} />
          {(Object.keys(ROLE_NAMES) as StaffRole[]).map((role) => (
            <label key={role} className="option items-center">
              <input
                type="checkbox"
                name="roles"
                value={role}
                defaultChecked={values.roles.includes(role)}
                className="size-5 shrink-0 accent-brand"
              />
              {ROLE_NAMES[role]}
            </label>
          ))}
        </fieldset>
        <Submit />
      </form>
    </div>
  );
}

function Field(props: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <label htmlFor={props.id} className="block font-medium">
        {props.label}
      </label>
      <ErrorText id={`${props.id}-error`} message={props.error} />
      {props.children}
    </div>
  );
}

function ErrorText({ id, message }: { id: string; message?: string }) {
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
      Add staff member
    </button>
  );
}
