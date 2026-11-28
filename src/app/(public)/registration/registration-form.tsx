"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { ArrowIcon, CheckIcon, ChevronIcon, InfoIcon, PlusIcon } from "@/components/icons";
import { Turnstile } from "@/components/turnstile";
import { registrationStep } from "./actions";
import {
  BACK,
  FieldError,
  FormShell,
  INPUT,
  invalid,
  Notice,
  PRIMARY,
  Question,
  QUESTION_LARGE,
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
 * Layout: the question stands large on the white page, one to a screen. Beside it on wide
 * screens a Black panel holds the title and the member's card: every step with its state and the
 * answers given so far. Each button shows a spinner while its post is on the way, and the
 * question dims, so a tap is answered at once on a slow connection.
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

  // What the member has said so far, shown beside each finished step: the card fills in as
  // they go, so the review at the end holds no surprises.
  const { values } = state;
  const answers: Partial<Record<Step, string>> = {
    name: values.fullName,
    fwo: values.isNewMember ? text.newMemberValue : values.fwoNumber,
    hbc:
      values.isNewMember && values.hbcUnknown
        ? text.hbcUnknownValue
        : (hbcs.find((h) => h.id === values.hbcId)?.name ?? ""),
    departments:
      departments
        .filter((d) => values.departmentIds.includes(d.id))
        .map((d) => d.name)
        .join(", ") || text.none,
    phone: values.phone,
  };

  return (
    <FormShell
      title={text.title}
      intro={text.intro}
      started={step !== "name"}
      help={{ title: text.helpTitle, body: text.helpBody }}
      // Members already on the church's list check first instead of registering again (D47,
      // D48). A plain link: a client-side navigation would keep this page's policy (CSP).
      note={
        step === "name" && (
          <p>
            {text.checkFirst}{" "}
            <a
              href="/registration/status"
              className="text-paper underline decoration-sky underline-offset-4 hover:decoration-paper"
            >
              {text.checkFirstLink}
            </a>
          </p>
        )
      }
      panel={<StepRail text={text} current={done ? null : step} index={index} answers={answers} />}
    >
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
    </FormShell>
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
      <div className="mt-8 space-y-7 transition-opacity duration-200 sm:mt-10 group-aria-busy:opacity-55">
        <Notice message={state.notice} />

        {step === "name" && (
          <Question
            large
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
            large
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
          <Question large id="hbcId" label={text.hbcLabel} error={errors.hbcId}>
            <div className="relative">
              <select
                id="hbcId"
                name="hbcId"
                defaultValue={values.hbcId}
                {...invalid("hbcId", errors)}
                className="select"
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
              <h2 id="step-heading" tabIndex={-1} className={QUESTION_LARGE}>
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
          <Question
            large
            id="phone"
            label={text.phoneLabel}
            hint={text.phoneHint}
            error={errors.phone}
          >
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
              <h2 id="step-heading" tabIndex={-1} className={QUESTION_LARGE}>
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
            <h2 id="step-heading" tabIndex={-1} className={QUESTION_LARGE}>
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
            large
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
      <div className="mt-10 flex flex-col gap-3 sm:mt-12 sm:flex-row-reverse sm:items-center sm:justify-between">
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

/** The step header: "Step 3 of 8", over a bar of eight segments. */
function Progress(props: { text: RegistrationText; index: number }) {
  const { text, index } = props;
  return (
    <div>
      <p className="text-small text-brand tabular-nums" aria-live="polite">
        {text.progress
          .replace("{current}", String(index))
          .replace("{total}", String(COUNTED_STEPS))}
      </p>
      <ol aria-hidden="true" className="mt-3 grid grid-flow-col gap-1.5">
        {RAIL_STEPS.map((s, i) => (
          <li
            key={s}
            className={`h-1 rounded-full transition-colors duration-300 ${
              i < index ? "bg-brand" : "bg-line"
            }`}
          />
        ))}
      </ol>
    </div>
  );
}

/**
 * The member's card, on the Black panel beside the question (wide screens): every step by name
 * with its state, and under each finished step what the member answered. Their own details, on
 * their own screen, and nowhere else (rule 2).
 */
function StepRail(props: {
  text: RegistrationText;
  current: Step | null;
  index: number;
  answers: Partial<Record<Step, string>>;
}) {
  const { text, current, index, answers } = props;
  return (
    <section aria-labelledby="steps-heading">
      <h2 id="steps-heading" className="font-sans text-small font-normal tracking-normal text-sky">
        {text.stepsLabel}
      </h2>
      <ol className="mt-3 border-t border-night-soft text-card">
        {RAIL_STEPS.map((s, i) => {
          const isCurrent = s === current;
          const isDone = current === null || i + 1 < index;
          const answer = isDone ? answers[s] : undefined;
          return (
            <li
              key={s}
              aria-current={isCurrent ? "step" : undefined}
              className={`grid min-h-12 grid-cols-[1.75rem_minmax(0,1fr)] items-center gap-x-3.5 border-b border-night-soft py-2.5 ${
                isCurrent || isDone ? "text-paper" : "text-sky"
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid size-7 place-items-center rounded-full text-small tabular-nums ${
                  isDone
                    ? "bg-brand text-paper"
                    : isCurrent
                      ? "bg-paper text-night"
                      : "border border-night-soft"
                }`}
              >
                {isDone ? <CheckIcon size="size-4" /> : i + 1}
              </span>
              <span className="min-w-0 lg:flex lg:items-baseline lg:justify-between lg:gap-4">
                <span className="block shrink-0">{text.stepNames[s]}</span>
                {answer && (
                  <span className="block truncate text-small text-sky tabular-nums">{answer}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Done({ text, reference }: { text: RegistrationText; reference?: string }) {
  return (
    <section aria-labelledby="step-heading" className="space-y-7">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-full bg-success text-paper"
      >
        <CheckIcon size="size-7" />
      </span>
      <h2 id="step-heading" tabIndex={-1} className={QUESTION_LARGE}>
        {text.doneTitle}
      </h2>
      <div className="rounded-[1.75rem] bg-mist p-7 sm:p-9">
        <p className="text-small text-ink-muted">{text.doneReference}</p>
        <p className="mt-2 text-display text-brand">{reference}</p>
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
