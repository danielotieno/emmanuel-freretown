"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon } from "@/components/icons";
import { CHURCH_OFFICE } from "@/lib/church-office";

/**
 * Pieces shared by the public forms under /registration: self-registration (FR-1) and the status
 * check (FR-7). Shared control styles live in globals.css (@layer components).
 */

export const INPUT = "field";
export const PRIMARY = "btn-primary w-full sm:w-auto sm:min-w-44";
export const SECONDARY = "btn-secondary w-full sm:w-auto";
export const BACK = "btn-text w-full justify-center sm:w-auto sm:justify-start sm:px-0";
export const QUESTION = "text-subtitle outline-none";
export const CARD =
  "in-card -mx-4 mt-8 border-y border-line bg-paper px-4 py-7 shadow-[0_1px_2px_rgb(10_20_51/0.04),0_16px_40px_-20px_rgb(10_20_51/0.18)] sm:mx-0 sm:rounded-[1.75rem] sm:border sm:p-10";

/**
 * A submit button that knows when its own post is on the way: it shows a spinner and aria-busy,
 * while every button in the form is disabled so nothing is sent twice. Without JavaScript it is a
 * plain submit button.
 */
export function SubmitButton(props: { intent: string; className: string; children: ReactNode }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("intent") === props.intent;
  return (
    <button
      type="submit"
      name="intent"
      value={props.intent}
      disabled={pending}
      aria-busy={mine || undefined}
      className={props.className}
    >
      {/* The label stays, so the button keeps its name and size; its icon gives way to the
          spinner (globals.css hides a busy button's svg). */}
      {mine && <span aria-hidden="true" className="spinner" />}
      {props.children}
    </button>
  );
}

/** False in the server's HTML (and so without JavaScript); true once the page runs in a browser. */
export function useScripted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function invalid(field: string, errors: Partial<Record<string, string>>) {
  return {
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": `${field}-hint ${field}-error`,
  } as const;
}

export function Question(props: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** Only the step's first question carries the heading id that focus moves to. */
  heading?: boolean;
  children: ReactNode;
}) {
  const heading = props.heading ?? true;
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 id={heading ? "step-heading" : undefined} tabIndex={-1} className={QUESTION}>
          <label htmlFor={props.id}>{props.label}</label>
        </h2>
        {props.hint && (
          <p id={`${props.id}-hint`} className="text-ink-muted">
            {props.hint}
          </p>
        )}
      </div>
      <FieldError id={`${props.id}-error`} message={props.error} />
      {props.children}
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
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

/** A whole-step message, such as a refused code. */
export function Notice({ message }: { message?: string }) {
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

/** "Need help?": the church office's number as a link, in place of "{phone}" in `body`. */
export function HelpPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="on-dark rounded-[1.75rem] bg-night p-6 text-paper sm:p-7">
      <h2 className="text-subtitle text-paper">{title}</h2>
      <p className="mt-2 text-card text-sky">
        {body.split("{phone}").map((part, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <a
                href={CHURCH_OFFICE.phoneHref}
                className="whitespace-nowrap text-paper underline decoration-sky underline-offset-4 tabular-nums hover:decoration-paper"
              >
                {CHURCH_OFFICE.phone}
              </a>
            )}
            {part}
          </Fragment>
        ))}
      </p>
    </div>
  );
}
