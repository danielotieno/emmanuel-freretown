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
/** A question's heading. On self-registration, one question to a screen, it is set large. */
export const QUESTION = "text-subtitle outline-none";
export const QUESTION_LARGE = "text-title outline-none";

/**
 * The frame both forms share (DESIGN.md §4 and §8). A Black panel carries the page's title, what
 * the form is for and, beside it on wide screens, whatever the form adds (self-registration's
 * card of answers); the question itself stands on the white page next to it, with no box around
 * it. On phones the panel is the page's opening and shrinks to its title once the member is past
 * the first step, so the question is never pushed off the first screen.
 */
export function FormShell(props: {
  title: string;
  intro: string;
  /** Past the first step: on phones the panel keeps only its title. */
  started: boolean;
  /** Shown under the intro while it is visible: a link, a note. */
  note?: ReactNode;
  /** The lower part of the panel, on wide screens only. */
  panel?: ReactNode;
  help: { title: string; body: string };
  children: ReactNode;
}) {
  const { started } = props;
  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:items-start lg:gap-8">
      <div className="on-dark flex flex-col rounded-[1.75rem] bg-night p-7 text-paper sm:p-10 lg:sticky lg:top-6 lg:col-span-5 lg:min-h-[calc(100svh-8.5rem)] lg:rounded-[2rem] lg:p-12">
        <h1 className={`text-paper ${started ? "text-subtitle lg:text-title" : "text-title"}`}>
          {props.title}
        </h1>
        <div className={started ? "hidden lg:block" : undefined}>
          <p className="mt-5 max-w-[46ch] text-card text-sky">{props.intro}</p>
          {props.note && <div className="mt-4 max-w-[46ch] text-card text-sky">{props.note}</div>}
        </div>
        {props.panel && <div className="mt-auto hidden pt-12 lg:block">{props.panel}</div>}
      </div>

      <div className="lg:col-span-6 lg:col-start-7 lg:pt-12 lg:pb-6">
        {props.children}
        <HelpLine title={props.help.title} body={props.help.body} />
      </div>
    </div>
  );
}

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
  /** One question to a screen: set its heading large. */
  large?: boolean;
  children: ReactNode;
}) {
  const heading = props.heading ?? true;
  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h2
          id={heading ? "step-heading" : undefined}
          tabIndex={-1}
          className={props.large ? QUESTION_LARGE : QUESTION}
        >
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
function HelpLine({ title, body }: { title: string; body: string }) {
  return (
    <div className="mt-12 rounded-[1.25rem] bg-cloud p-5 sm:p-6">
      <h2 className="text-subtitle">{title}</h2>
      <p className="mt-1.5 text-card text-ink-muted">
        {body.split("{phone}").map((part, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <a
                href={CHURCH_OFFICE.phoneHref}
                className="whitespace-nowrap text-ink underline decoration-line-strong underline-offset-4 tabular-nums hover:text-brand hover:decoration-brand"
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
