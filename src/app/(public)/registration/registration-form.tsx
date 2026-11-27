"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { ArrowIcon, CheckIcon, ChevronIcon, InfoIcon, PlusIcon } from "@/components/icons";
import { Turnstile } from "@/components/turnstile";
import { registrationStep } from "./actions";
import {
  BACK,
  CARD,
  FieldError,
  HelpPanel,
  INPUT,
  invalid,
  Notice,
  PRIMARY,
  Question,
  QUESTION,
  SECONDARY,
  SubmitButton,
  useScripted,
} from "./form-parts";
import {
  COUNTED_STEPS,
  EMPTY_VALUES,
  STEP_FIELDS,
  STEPS,
  type FormValues,
  type RegistrationState,
  type Step,
} from "./state";
import type { RegistrationText } from "./text";

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

/** The steps the progress rail lists: every step but "done". */
const RAIL_STEPS = STEPS.filter((s): s is Exclude<Step, "done"> => s !== "done");

/**
 * Self-registration (FR-1): one question per step, with a progress indicator and "Why we ask"
 * notes (DESIGN.md). A plain form posting to a server action, so it works without JavaScript
 * until the code step, where Turnstile needs it.
 *
 * Layout (#96): the question sits on a card; beside it on wide screens, a rail lists every step
 * with its state, and a panel says where to get help. Each button shows a spinner while its post
 * is on the way, and the question dims, so a tap is answered at once on a slow connection.
 */
export function RegistrationForm({ text, hbcs, departments, turnstileSiteKey }: Props) {
  const [state, formAction, pending] = useActionState(registrationStep, INITIAL);
  const firstRender = useRef(true);
  const scripted = useScripted();
  const { step } = state;

  // Move focus to the new step's heading, so screen readers announce it (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.getElementById("step-heading")?.focus();
  }, [state]);

  const done = step === "done";
  const index = done ? COUNTED_STEPS : STEPS.indexOf(step) + 1;

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <div className="lg:col-span-7">
        <h1 className="text-title">{text.title}</h1>
        <p className="mt-4 max-w-[52ch] text-lead text-ink-muted">{text.intro}</p>
        {/* Members already on the church's list check first instead of registering again (D47,
            D48). A plain link: a client-side navigation would keep this page's policy (CSP). */}
        {step === "name" && (
          <p className="mt-3 max-w-[52ch]">
            {text.checkFirst}{" "}
            <a href="/registration/status" className="underline underline-offset-4">
              {text.checkFirstLink}
            </a>
          </p>
        )}

        <div className={CARD}>
          {done ? (
            <Done text={text} reference={state.reference} />
          ) : (
            <StepForm
              text={text}
              state={state}
              index={index}
              pending={pending}
              formAction={formAction}
              hbcs={hbcs}
              departments={departments}
              turnstileSiteKey={turnstileSiteKey}
              scripted={scripted}
            />
          )}
        </div>
      </div>

      <aside className="space-y-4 lg:col-span-4 lg:col-start-9 lg:pt-3">
        <div className="sticky top-6 space-y-4">
          <StepRail text={text} current={done ? null : step} index={index} />
          <HelpPanel title={text.helpTitle} body={text.helpBody} />
        </div>
      </aside>
    </div>
  );
}

function StepForm(props: {
  text: RegistrationText;
  state: RegistrationState;
  index: number;
  pending: boolean;
  formAction: (payload: FormData) => void;
  hbcs: Option[];
  departments: Option[];
  turnstileSiteKey: string;
  scripted: boolean;
}) {
  const { text, state, index, pending, formAction, hbcs, departments, turnstileSiteKey } = props;
  const { step, values, errors } = state;
  const hidden = hiddenFields(step, values);
  const hbcName = hbcs.find((h) => h.id === values.hbcId)?.name ?? "";
  const departmentNames = departments
    .filter((d) => values.departmentIds.includes(d.id))
    .map((d) => d.name);

  return (
    <form action={formAction} noValidate aria-busy={pending || undefined} className="group">
      <Progress text={text} index={index} />

      <input type="hidden" name="step" value={step} />
      {state.challengeId && <input type="hidden" name="challengeId" value={state.challengeId} />}
      {hidden}

      {/* While a post is on the way the question dims, so the tap is visibly answered. */}
      <div className="mt-8 space-y-7 transition-opacity duration-200 lg:mt-0 group-aria-busy:opacity-55">
        <Notice message={state.notice} />

        {step === "name" && (
          <Question
            id="fullName"
            label={text.nameLabel}
            hint={text.nameHint}
            error={errors.fullName}
          >
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
          <Question
            id="fwoNumber"
            label={text.fwoLabel}
            hint={text.fwoHint}
            error={errors.fwoNumber}
          >
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
            <div className="relative">
              <select
                id="hbcId"
                name="hbcId"
                defaultValue={values.hbcId}
                {...invalid("hbcId", errors)}
                className={`${INPUT} cursor-pointer appearance-none pr-12`}
              >
                <option value="">{text.hbcChoose}</option>
                {hbcs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              <ChevronIcon className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-muted" />
            </div>
            {/* D49: only a new member may leave the HBC to the Church Secretary. */}
            {values.isNewMember && (
              <Tick
                name="hbcUnknown"
                checked={values.hbcUnknown}
                label={text.hbcUnknownLabel}
                hint={text.hbcUnknownHint}
              />
            )}
          </Question>
        )}

        {step === "departments" && (
          <fieldset aria-describedby="departments-hint departments-error" className="space-y-3">
            <legend className="mb-3">
              <h2 id="step-heading" tabIndex={-1} className={QUESTION}>
                {text.departmentsLabel}
              </h2>
            </legend>
            <p id="departments-hint" className="text-ink-muted">
              {text.departmentsHint}
            </p>
            <FieldError id="departments-error" message={errors.departmentIds} />
            <div className="grid gap-2 sm:grid-cols-2">
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
            </div>
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
            <p className="flex gap-3 rounded-xl bg-mist p-4 text-ink">
              <InfoIcon className="mt-1 text-brand" />
              <span>{text.phoneOwn}</span>
            </p>
            <WhyWeAsk title={text.whyWeAsk}>{text.phoneWhy}</WhyWeAsk>
          </Question>
        )}

        {step === "declarations" && (
          <fieldset className="space-y-3">
            <legend className="mb-3">
              <h2 id="step-heading" tabIndex={-1} className={QUESTION}>
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
          <section aria-labelledby="step-heading" className="space-y-5">
            <h2 id="step-heading" tabIndex={-1} className={QUESTION}>
              {text.reviewTitle}
            </h2>
            <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
              <Row term={text.nameLabel}>{values.fullName}</Row>
              <Row term={text.fwoLabel}>
                {values.isNewMember ? (
                  text.newMemberValue
                ) : (
                  <span className="tabular-nums">{values.fwoNumber}</span>
                )}
              </Row>
              <Row term={text.hbcLabel}>
                {values.isNewMember && values.hbcUnknown ? text.hbcUnknownValue : hbcName}
              </Row>
              <Row term={text.departmentsLabel}>
                {departmentNames.length ? departmentNames.join(", ") : text.none}
              </Row>
              <Row term={text.phoneLabel}>
                <span className="tabular-nums">{values.phone}</span>
              </Row>
            </dl>
            <p className="text-ink-muted">{text.reviewHint}</p>
            {/* A fresh widget after every answer from the server: a spent token is never reused. */}
            {turnstileSiteKey && <Turnstile key={state.attempt} siteKey={turnstileSiteKey} />}
            {/* Shown until JavaScript runs (no Turnstile without it, so no code), and wherever
                Turnstile isn't configured: the church office can still register the member. */}
            {(!props.scripted || !turnstileSiteKey) && (
              <p className="flex gap-3 rounded-xl bg-mist p-4">
                <InfoIcon className="mt-1 text-brand" />
                <span>{text.jsNeeded}</span>
              </p>
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
              className={`${INPUT} max-w-[12ch] text-center text-subtitle tracking-[0.3em] tabular-nums`}
            />
          </Question>
        )}
      </div>

      {/* The primary button comes first in the markup: pressing Enter submits the first one. */}
      <div className="mt-10 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row-reverse sm:items-center sm:justify-between">
        <SubmitButton intent="next" className={PRIMARY}>
          {step === "review" ? text.sendCode : step === "code" ? text.verify : text.continue}
          <ArrowIcon />
        </SubmitButton>
        {step !== "name" && step !== "code" && (
          <SubmitButton intent="back" className={BACK}>
            <ArrowIcon className="rotate-180" />
            {text.back}
          </SubmitButton>
        )}
        {step === "code" && (
          <SubmitButton intent="new-code" className={SECONDARY}>
            {text.newCode}
          </SubmitButton>
        )}
      </div>
    </form>
  );
}

/** The step header: "Step 3 of 8", over a bar of eight segments on phones and tablets. */
function Progress(props: { text: RegistrationText; index: number }) {
  const { text, index } = props;
  return (
    <div>
      {/* From lg the rail beside the card marks the step, so the count is kept for screen
          readers only (it still announces each step). */}
      <p className="text-small text-brand tabular-nums lg:sr-only" aria-live="polite">
        {text.progress
          .replace("{current}", String(index))
          .replace("{total}", String(COUNTED_STEPS))}
      </p>
      {/* On wide screens the rail beside the card shows progress, so the bar is for phones. */}
      <ol aria-hidden="true" className="mt-3 grid grid-flow-col gap-1.5 lg:hidden">
        {RAIL_STEPS.map((s, i) => (
          <li
            key={s}
            className={`h-1.5 rounded-full transition-colors duration-300 ${
              i < index ? "bg-brand" : "bg-line"
            }`}
          />
        ))}
      </ol>
    </div>
  );
}

/** Every step by name, with its state: done, current or still to come. Wide screens only. */
function StepRail(props: { text: RegistrationText; current: Step | null; index: number }) {
  const { text, current, index } = props;
  return (
    <section
      aria-labelledby="steps-heading"
      className="hidden rounded-[1.75rem] border border-line bg-paper p-7 lg:block"
    >
      <h2 id="steps-heading" className="text-subtitle">
        {text.stepsLabel}
      </h2>
      <ol className="mt-5 space-y-1 text-card">
        {RAIL_STEPS.map((s, i) => {
          const isCurrent = s === current;
          const isDone = current === null || i + 1 < index;
          return (
            <li
              key={s}
              aria-current={isCurrent ? "step" : undefined}
              className={`flex min-h-11 items-center gap-3.5 rounded-xl px-2 ${
                isCurrent ? "bg-mist text-ink" : isDone ? "text-ink" : "text-ink-muted"
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid size-7 shrink-0 place-items-center rounded-full text-small tabular-nums ${
                  isDone
                    ? "bg-brand text-paper"
                    : isCurrent
                      ? "border-2 border-brand text-brand"
                      : "border border-line-strong"
                }`}
              >
                {isDone ? <CheckIcon size="size-4" /> : i + 1}
              </span>
              {text.stepNames[s]}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Done({ text, reference }: { text: RegistrationText; reference?: string }) {
  return (
    <section aria-labelledby="step-heading" className="space-y-6">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-full bg-success text-paper"
      >
        <CheckIcon size="size-7" />
      </span>
      <h2 id="step-heading" tabIndex={-1} className={QUESTION}>
        {text.doneTitle}
      </h2>
      <div className="rounded-2xl bg-mist p-6 sm:p-7">
        <p className="text-small text-ink-muted">{text.doneReference}</p>
        <p className="mt-1 text-title text-brand tabular-nums">{reference}</p>
        <p className="mt-4 text-ink-muted">{text.doneSms}</p>
      </div>
      <p>{text.doneNext}</p>
    </section>
  );
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

function Tick(props: {
  name: keyof FormValues;
  checked: boolean;
  label: string;
  hint?: string;
  error?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
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
    <details className="group/why rounded-xl border border-line bg-cloud px-4">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-ink [&::-webkit-details-marker]:hidden">
        {title}
        <PlusIcon className="text-brand transition-transform duration-200 group-open/why:rotate-45" />
      </summary>
      <p className="pb-4 text-ink-muted">{children}</p>
    </details>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-3 sm:gap-4">
      <dt className="text-ink-muted">{term}</dt>
      <dd className="sm:col-span-2">{children}</dd>
    </div>
  );
}
