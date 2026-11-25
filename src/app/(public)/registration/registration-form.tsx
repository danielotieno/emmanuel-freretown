"use client";

import { useActionState, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { registrationStep } from "./actions";
import {
  COUNTED_STEPS,
  EMPTY_VALUES,
  STEP_FIELDS,
  STEPS,
  type ErrorField,
  type FormValues,
  type RegistrationState,
  type Step,
} from "./state";
import type { RegistrationText } from "./text";
import { Turnstile } from "./turnstile";

interface Option {
  id: string;
  name: string;
}

interface Props {
  text: RegistrationText;
  hbcs: Option[];
  departments: Option[];
  turnstileSiteKey: string;
}

const INITIAL: RegistrationState = { step: "name", values: EMPTY_VALUES, errors: {}, attempt: 0 };

/**
 * Self-registration (FR-1): one question per step, with a progress indicator and "Why we ask"
 * notes (DESIGN.md). A plain form posting to a server action, so it works without JavaScript
 * until the code step, where Turnstile needs it.
 */
export function RegistrationForm({ text, hbcs, departments, turnstileSiteKey }: Props) {
  const [state, formAction, pending] = useActionState(registrationStep, INITIAL);
  const firstRender = useRef(true);
  const scripted = useScripted();
  const { step, values, errors } = state;

  // Move focus to the new step's heading, so screen readers announce it (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.getElementById("step-heading")?.focus();
  }, [state]);

  if (step === "done") {
    return (
      <section aria-labelledby="step-heading" className="space-y-5">
        <h2 id="step-heading" tabIndex={-1} className="text-3xl outline-none">
          {text.doneTitle}
        </h2>
        <div className="rounded-2xl bg-lagoon p-6">
          <p className="text-sm text-ink-muted">{text.doneReference}</p>
          <p className="mt-1 font-display text-4xl tracking-wide text-brand tabular-nums">
            {state.reference}
          </p>
          <p className="mt-3 text-ink-muted">{text.doneSms}</p>
        </div>
        <p>{text.doneNext}</p>
      </section>
    );
  }

  const index = STEPS.indexOf(step) + 1;
  const hidden = hiddenFields(step, values);
  const hbcName = hbcs.find((h) => h.id === values.hbcId)?.name ?? "";
  const departmentNames = departments
    .filter((d) => values.departmentIds.includes(d.id))
    .map((d) => d.name);

  return (
    <form action={formAction} noValidate className="space-y-7">
      <div className="space-y-2">
        <p className="text-sm text-ink-muted tabular-nums" aria-live="polite">
          {text.progress
            .replace("{current}", String(index))
            .replace("{total}", String(COUNTED_STEPS))}
        </p>
        <progress
          value={index}
          max={COUNTED_STEPS}
          aria-hidden="true"
          className="block h-1.5 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-sand [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-brand"
        />
      </div>

      <input type="hidden" name="step" value={step} />
      {state.challengeId && <input type="hidden" name="challengeId" value={state.challengeId} />}
      {hidden}

      {state.notice && (
        <p role="alert" className="rounded-xl border border-error/30 bg-error/5 p-4 text-error">
          <span aria-hidden="true">⚠ </span>
          {state.notice}
        </p>
      )}

      {step === "name" && (
        <Question id="fullName" label={text.nameLabel} hint={text.nameHint} error={errors.fullName}>
          <input
            id="fullName"
            name="fullName"
            defaultValue={values.fullName}
            autoComplete="name"
            maxLength={120}
            {...invalid("fullName", errors)}
            className={INPUT}
          />
        </Question>
      )}

      {step === "fwo" && (
        <Question id="fwoNumber" label={text.fwoLabel} hint={text.fwoHint} error={errors.fwoNumber}>
          <input
            id="fwoNumber"
            name="fwoNumber"
            defaultValue={values.fwoNumber}
            inputMode="numeric"
            autoComplete="off"
            {...invalid("fwoNumber", errors)}
            className={`${INPUT} tabular-nums`}
          />
          <Tick
            name="isNewMember"
            checked={values.isNewMember}
            label={text.newMemberLabel}
            hint={text.newMemberHint}
          />
        </Question>
      )}

      {step === "hbc" && (
        <Question id="hbcId" label={text.hbcLabel} error={errors.hbcId}>
          <select
            id="hbcId"
            name="hbcId"
            defaultValue={values.hbcId}
            {...invalid("hbcId", errors)}
            className={INPUT}
          >
            <option value="">{text.hbcChoose}</option>
            {hbcs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </Question>
      )}

      {step === "departments" && (
        <fieldset aria-describedby="departments-hint departments-error" className="space-y-3">
          <legend>
            <h2 id="step-heading" tabIndex={-1} className="text-3xl outline-none">
              {text.departmentsLabel}
            </h2>
          </legend>
          <p id="departments-hint" className="text-ink-muted">
            {text.departmentsHint}
          </p>
          <FieldError id="departments-error" message={errors.departmentIds} />
          {departments.map((d) => (
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
        </fieldset>
      )}

      {step === "phone" && (
        <Question id="phone" label={text.phoneLabel} hint={text.phoneHint} error={errors.phone}>
          <input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={values.phone}
            inputMode="tel"
            autoComplete="tel-national"
            maxLength={20}
            {...invalid("phone", errors)}
            className={`${INPUT} tabular-nums`}
          />
          <p className="rounded-xl bg-lagoon p-4 text-ink">{text.phoneOwn}</p>
          <WhyWeAsk title={text.whyWeAsk}>{text.phoneWhy}</WhyWeAsk>
        </Question>
      )}

      {step === "declarations" && (
        <fieldset className="space-y-4">
          <legend>
            <h2 id="step-heading" tabIndex={-1} className="text-3xl outline-none">
              {text.declarationsTitle}
            </h2>
          </legend>
          <Tick
            name="adultDeclared"
            checked={values.adultDeclared}
            label={text.adultLabel}
            error={errors.adultDeclared}
          />
          <Tick
            name="privacyAcknowledged"
            checked={values.privacyAcknowledged}
            label={text.privacyLabel}
            error={errors.privacyAcknowledged}
            extra={
              <a href="/privacy" target="_blank" rel="noopener">
                {text.privacyLink}
              </a>
            }
          />
          <Tick
            name="transferConsent"
            checked={values.transferConsent}
            label={text.consentLabel}
            error={errors.transferConsent}
          />
          <WhyWeAsk title={text.whyWeAsk}>{text.consentWhy}</WhyWeAsk>
        </fieldset>
      )}

      {step === "review" && (
        <section aria-labelledby="step-heading" className="space-y-4">
          <h2 id="step-heading" tabIndex={-1} className="text-3xl outline-none">
            {text.reviewTitle}
          </h2>
          <dl className="divide-y divide-line rounded-2xl border border-line">
            <Row term={text.nameLabel}>{values.fullName}</Row>
            <Row term={text.fwoLabel}>
              {values.isNewMember ? (
                text.newMemberValue
              ) : (
                <span className="tabular-nums">{values.fwoNumber}</span>
              )}
            </Row>
            <Row term={text.hbcLabel}>{hbcName}</Row>
            <Row term={text.departmentsLabel}>
              {departmentNames.length ? departmentNames.join(", ") : text.none}
            </Row>
            <Row term={text.phoneLabel}>
              <span className="tabular-nums">{values.phone}</span>
            </Row>
          </dl>
          <p>{text.reviewHint}</p>
          {/* A fresh widget after every answer from the server: a spent token is never reused. */}
          {turnstileSiteKey && <Turnstile key={state.attempt} siteKey={turnstileSiteKey} />}
          {/* Shown until JavaScript runs (no Turnstile without it, so no code), and wherever
              Turnstile isn't configured: the church office can still register the member. */}
          {(!scripted || !turnstileSiteKey) && (
            <p className="rounded-xl bg-lagoon p-4">{text.jsNeeded}</p>
          )}
        </section>
      )}

      {step === "code" && (
        <Question
          id="code"
          label={text.codeLabel}
          hint={`${text.codeSent.replace("{phone}", values.phone)} ${text.codeHint}`}
          error={errors.code}
        >
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            {...invalid("code", errors)}
            className={`${INPUT} max-w-[11ch] text-center text-2xl tracking-[0.3em] tabular-nums`}
          />
        </Question>
      )}

      {/* The primary button comes first in the markup: pressing Enter submits the first one. */}
      <div className="flex flex-col gap-3 pt-2 sm:flex-row-reverse sm:justify-between">
        <button type="submit" name="intent" value="next" disabled={pending} className={PRIMARY}>
          {step === "review" ? text.sendCode : step === "code" ? text.verify : text.continue}
        </button>
        {step !== "name" && step !== "code" && (
          <button type="submit" name="intent" value="back" disabled={pending} className={SECONDARY}>
            {text.back}
          </button>
        )}
        {step === "code" && (
          <button
            type="submit"
            name="intent"
            value="new-code"
            disabled={pending}
            className={SECONDARY}
          >
            {text.newCode}
          </button>
        )}
      </div>
    </form>
  );
}

/** False in the server's HTML (and so without JavaScript); true once the page runs in a browser. */
function useScripted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

// Shared control styles live in globals.css (@layer components).
const INPUT = "field";
const PRIMARY = "btn-primary w-full sm:w-auto";
const SECONDARY = "btn-secondary w-full sm:w-auto";

function invalid(field: ErrorField, errors: RegistrationState["errors"]) {
  return {
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": `${field}-hint ${field}-error`,
  } as const;
}

/** Every value except the current step's, as hidden fields, so the answers survive each post. */
function hiddenFields(step: Step, values: FormValues): ReactNode[] {
  const shown = new Set(STEP_FIELDS[step] ?? []);
  const out: ReactNode[] = [];
  for (const [name, value] of Object.entries(values) as [
    keyof FormValues,
    FormValues[keyof FormValues],
  ][]) {
    if (shown.has(name)) continue;
    if (Array.isArray(value)) {
      value.forEach((v) =>
        out.push(<input key={`${name}-${v}`} type="hidden" name={name} value={v} />),
      );
    } else if (typeof value === "boolean") {
      if (value) out.push(<input key={name} type="hidden" name={name} value="on" />);
    } else if (value) {
      out.push(<input key={name} type="hidden" name={name} value={value} />);
    }
  }
  return out;
}

function Question(props: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h2 id="step-heading" tabIndex={-1} className="text-3xl outline-none">
        <label htmlFor={props.id}>{props.label}</label>
      </h2>
      {props.hint && (
        <p id={`${props.id}-hint`} className="text-ink-muted">
          {props.hint}
        </p>
      )}
      <FieldError id={`${props.id}-error`} message={props.error} />
      {props.children}
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return (
    <p id={id} className="text-error empty:hidden">
      {message && (
        <>
          <span aria-hidden="true">⚠ </span>
          {message}
        </>
      )}
    </p>
  );
}

function Tick(props: {
  name: keyof FormValues;
  checked: boolean;
  label: string;
  hint?: string;
  error?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <FieldError id={`${props.name}-error`} message={props.error} />
      <label className="option">
        <input
          type="checkbox"
          name={props.name}
          defaultChecked={props.checked}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={`${props.name}-error${props.hint ? ` ${props.name}-hint` : ""}`}
          className="mt-1 size-5 shrink-0 accent-brand"
        />
        <span>
          {props.label}
          {props.hint && (
            <span id={`${props.name}-hint`} className="mt-1 block text-ink-muted">
              {props.hint}
            </span>
          )}
        </span>
      </label>
      {props.extra && <p className="pl-4">{props.extra}</p>}
    </div>
  );
}

function WhyWeAsk({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-line p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-ink [&::-webkit-details-marker]:hidden">
        {title}
        <span aria-hidden="true" className="text-xl leading-none text-brand group-open:rotate-45">
          +
        </span>
      </summary>
      <p className="mt-3 text-ink-muted">{children}</p>
    </details>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-3">
      <dt className="text-sm text-ink-muted sm:text-base">{term}</dt>
      <dd className="sm:col-span-2">{children}</dd>
    </div>
  );
}
