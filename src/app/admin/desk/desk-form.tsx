"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";
import { AlertIcon, ArrowIcon, CheckIcon, ChevronIcon, InfoIcon } from "@/components/icons";
import { Turnstile } from "@/components/turnstile";
import { checkDeskStep, sendDeskCode, submitDeskRegistration } from "./actions";
import type { DeskText } from "./text";
import {
  clearDraft,
  countedSteps,
  emptyDeskValues,
  loadDraft,
  loadEvent,
  PHONE_MODES,
  saveDraft,
  saveEvent,
  type DeskAnswer,
  type DeskDraft,
  type DeskErrorField,
  type DeskStep,
  type DeskValues,
} from "./values";

interface Option {
  id: string;
  name: string;
}

interface Props {
  text: DeskText;
  officerId: string;
  hbcs: Option[];
  departments: Option[];
  turnstileSiteKey: string;
  privacyUrl: string;
}

/**
 * The officer desk (FR-3, #18), built for a mid-range Android phone held by the officer. Unlike
 * the public form it needs JavaScript: it keeps the unfinished registration in this tab
 * (values.ts, `saveDraft`) after every change, so a reload, a dropped connection or a sign-in
 * after an idle timeout loses nothing. The server checks each step and stores the registration;
 * the browser holds the answers until then.
 */
export function DeskForm(props: Props) {
  // The draft lives in sessionStorage, which the server can't read: the form starts in the
  // browser, so its first render already shows the restored answers.
  const scripted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!scripted) {
    return (
      <Card>
        <p className="text-ink-muted">{props.text.loading}</p>
        <noscript>
          <p className="mt-4">{props.text.jsNeeded}</p>
        </noscript>
      </Card>
    );
  }
  return <Desk {...props} />;
}

type Done = { reference: string; sms: boolean; isNewMember: boolean };

function freshDraft(officerId: string): DeskDraft {
  return { step: "event", values: emptyDeskValues(loadEvent(officerId) ?? undefined) };
}

function Desk({ text, officerId, hbcs, departments, turnstileSiteKey, privacyUrl }: Props) {
  const [restored] = useState(() => loadDraft(officerId));
  const [draft, setDraft] = useState<DeskDraft>(() => restored ?? freshDraft(officerId));
  const [errors, setErrors] = useState<DeskAnswer["errors"]>({});
  const [alert, setAlert] = useState<string>();
  const [info, setInfo] = useState(() =>
    restored && restored.step !== "event" ? text.restored : undefined,
  );
  const [done, setDone] = useState<Done | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [, startTransition] = useTransition();
  const firstRender = useRef(true);
  const inFlight = useRef(false);

  const { step, values } = draft;

  // Every change is kept in this tab at once (values.ts), until the registration is submitted.
  useEffect(() => {
    if (!done) saveDraft(officerId, draft);
  }, [draft, done, officerId]);

  // Move focus to the new step's heading, so screen readers announce it (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.getElementById("step-heading")?.focus();
  }, [step, done]);

  const set = (patch: Partial<DeskValues>) =>
    setDraft((d) => ({ ...d, values: { ...d.values, ...patch } }));
  const goTo = (next: DeskStep) => {
    setErrors({});
    setAlert(undefined);
    setInfo(undefined);
    setDraft((d) => ({ ...d, step: next }));
  };

  /** Calls the server; a dropped connection or a failure keeps every answer where it is. */
  function run(intent: string, call: () => Promise<DeskAnswer>) {
    // A ref, not state: two quick taps or Enter presses land before React re-renders.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(intent);
    setAlert(undefined);
    setInfo(undefined);
    startTransition(async () => {
      try {
        const answer = await call();
        // A redirect (an idle timeout sends the officer to sign in) answers nothing.
        if (answer) apply(answer);
      } catch (error) {
        const offline = !navigator.onLine || error instanceof TypeError;
        setAlert(offline ? text.offline : text.generic);
      } finally {
        inFlight.current = false;
        setBusy(null);
        // Turnstile accepts each token once: a fresh widget after every answer.
        setAttempt((a) => a + 1);
      }
    });
  }

  function apply(answer: DeskAnswer) {
    if (answer.step === "done" && answer.reference) {
      clearDraft(officerId);
      setDone({ reference: answer.reference, sms: !!answer.sms, isNewMember: values.isNewMember });
      setCode("");
      setErrors({});
      return;
    }
    setErrors(answer.errors);
    if (answer.notice) setAlert(answer.notice);
    if (step === "event" && answer.step === "member") saveEvent(officerId, values);
    if (answer.step !== "code") setCode("");
    setDraft((d) => ({
      step: answer.step ?? d.step,
      challengeId: answer.challengeId ?? (answer.step === "code" ? d.challengeId : undefined),
      values: answer.unavailableDepartmentIds
        ? {
            ...d.values,
            departmentIds: d.values.departmentIds.filter(
              (id) => !answer.unavailableDepartmentIds!.includes(id),
            ),
          }
        : d.values,
    }));
  }

  function primary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const turnstileToken = new FormData(event.currentTarget).get("cf-turnstile-response");
    if (step === "confirm" && values.phoneMode === "otp") {
      run("send", () => sendDeskCode(values, turnstileToken));
    } else if (step === "confirm") {
      run("submit", () => submitDeskRegistration(values, { turnstileToken }));
    } else if (step === "code") {
      run("submit", () => submitDeskRegistration(values, { challengeId: draft.challengeId, code }));
    } else {
      run("next", () => checkDeskStep(step, values));
    }
  }

  function startOver() {
    if (!window.confirm(text.startOverConfirm)) return;
    clearDraft(officerId);
    setCode("");
    setDraft(freshDraft(officerId));
    goTo("event");
  }

  function nextPerson() {
    setDone(null);
    setDraft(freshDraft(officerId));
    goTo("member");
  }

  if (done) {
    return (
      <Card>
        <section aria-labelledby="step-heading" className="space-y-5">
          <span
            aria-hidden="true"
            className="grid size-12 place-items-center rounded-full bg-success text-paper"
          >
            <CheckIcon size="size-6" />
          </span>
          <h2 id="step-heading" tabIndex={-1} className={QUESTION}>
            {text.doneTitle}
          </h2>
          <div className="rounded-2xl bg-mist p-5">
            <p className="text-small text-ink-muted">{text.doneReference}</p>
            <p className="mt-1 text-title text-brand tabular-nums">{done.reference}</p>
            <p className="mt-3 text-ink-muted">{done.sms ? text.doneSms : text.doneNoSms}</p>
          </div>
          {done.isNewMember && <Notice>{text.doneNewMember}</Notice>}
          <div className="border-t border-line pt-5">
            <button type="button" className={PRIMARY} onClick={nextPerson}>
              {text.nextPerson}
              <ArrowIcon />
            </button>
          </div>
        </section>
      </Card>
    );
  }

  const steps = countedSteps(values.phoneMode);
  const index = Math.max(steps.indexOf(step), 0) + 1;
  const hbcName = hbcs.find((h) => h.id === values.hbcId)?.name ?? "";
  const departmentNames = departments
    .filter((d) => values.departmentIds.includes(d.id))
    .map((d) => d.name);
  const phoneMode = values.phoneMode || null;
  const pending = busy !== null;

  return (
    <Card>
      <form onSubmit={primary} noValidate aria-busy={pending || undefined} className="group">
        <p className="text-small text-brand tabular-nums" aria-live="polite">
          {text.progress
            .replace("{current}", String(index))
            .replace("{total}", String(steps.length))}
          <span className="text-ink-muted">
            {" "}
            · {text.stepNames[step as keyof typeof text.stepNames]}
          </span>
        </p>
        <ol aria-hidden="true" className="mt-3 grid grid-flow-col gap-1.5">
          {steps.map((s, i) => (
            <li
              key={s}
              className={`h-1.5 rounded-full transition-colors duration-300 ${
                i < index ? "bg-brand" : "bg-line"
              }`}
            />
          ))}
        </ol>

        <div className="mt-6 space-y-6 transition-opacity duration-200 group-aria-busy:opacity-55">
          {info && <Notice>{info}</Notice>}
          {alert && (
            <p
              role="alert"
              className="flex gap-3 rounded-xl border border-error/40 bg-error/5 p-4 text-error"
            >
              <AlertIcon className="mt-1" />
              <span>{alert}</span>
            </p>
          )}

          {step === "event" && (
            <>
              <Question
                id="eventLabel"
                label={text.eventTitle}
                hint={text.eventHint}
                error={errors.eventLabel}
              >
                <input
                  id="eventLabel"
                  value={values.eventLabel}
                  onChange={(e) => set({ eventLabel: e.target.value })}
                  maxLength={120}
                  autoComplete="off"
                  {...invalid("eventLabel", errors)}
                  className="field"
                />
              </Question>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-ink">{text.languageLabel}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(["en", "sw"] as const).map((lang) => (
                    <label key={lang} className="option items-center" lang={lang}>
                      <input
                        type="radio"
                        name="language"
                        checked={values.language === lang}
                        onChange={() => set({ language: lang })}
                        className="size-5 shrink-0 accent-brand"
                      />
                      {text.languages[lang]}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {step === "member" && (
            <>
              <h2 id="step-heading" tabIndex={-1} className={QUESTION}>
                {text.memberTitle}
              </h2>
              <Field
                id="fullName"
                label={text.nameLabel}
                hint={text.nameHint}
                error={errors.fullName}
              >
                <input
                  id="fullName"
                  value={values.fullName}
                  onChange={(e) => set({ fullName: e.target.value })}
                  maxLength={120}
                  autoComplete="off"
                  {...invalid("fullName", errors)}
                  className="field"
                />
              </Field>
              <Field
                id="fwoNumber"
                label={text.fwoLabel}
                hint={text.fwoHint}
                error={errors.fwoNumber}
              >
                <input
                  id="fwoNumber"
                  value={values.fwoNumber}
                  onChange={(e) => set({ fwoNumber: e.target.value })}
                  inputMode="numeric"
                  autoComplete="off"
                  disabled={values.isNewMember}
                  {...invalid("fwoNumber", errors)}
                  className="field tabular-nums disabled:opacity-60"
                />
                <Tick
                  name="isNewMember"
                  checked={values.isNewMember}
                  onChange={(isNewMember) => set({ isNewMember })}
                  label={text.newMemberLabel}
                  hint={text.newMemberHint}
                />
              </Field>
              <Field id="hbcId" label={text.hbcLabel} error={errors.hbcId}>
                <div className="relative">
                  <select
                    id="hbcId"
                    value={values.hbcId}
                    onChange={(e) => set({ hbcId: e.target.value })}
                    {...invalid("hbcId", errors)}
                    className="field cursor-pointer appearance-none pr-12"
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
              </Field>
              <fieldset
                aria-describedby="departmentIds-hint departmentIds-error"
                className="space-y-2"
              >
                <legend className="text-ink">{text.departmentsLabel}</legend>
                <p id="departmentIds-hint" className="text-ink-muted">
                  {text.departmentsHint}
                </p>
                <FieldError id="departmentIds-error" message={errors.departmentIds} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {departments.map((d) => (
                    <label key={d.id} className="option items-center">
                      <input
                        type="checkbox"
                        checked={values.departmentIds.includes(d.id)}
                        onChange={(e) =>
                          set({
                            departmentIds: e.target.checked
                              ? [...values.departmentIds, d.id]
                              : values.departmentIds.filter((id) => id !== d.id),
                          })
                        }
                        className="size-5 shrink-0 accent-brand"
                      />
                      {d.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {step === "phone" && (
            <>
              <fieldset
                aria-describedby="phoneMode-error"
                aria-invalid={errors.phoneMode ? true : undefined}
                className="space-y-2"
              >
                <legend className="mb-3">
                  <h2 id="step-heading" tabIndex={-1} className={QUESTION}>
                    {text.phoneTitle}
                  </h2>
                </legend>
                <FieldError id="phoneMode-error" message={errors.phoneMode} />
                {PHONE_MODES.map((mode) => (
                  <label key={mode} className="option">
                    <input
                      type="radio"
                      name="phoneMode"
                      checked={values.phoneMode === mode}
                      onChange={() => set({ phoneMode: mode })}
                      aria-describedby={`phoneMode-${mode}-hint`}
                      className="mt-1 size-5 shrink-0 accent-brand"
                    />
                    <span>
                      {text.phoneModes[mode].label}
                      <span id={`phoneMode-${mode}-hint`} className="mt-1 block text-ink-muted">
                        {text.phoneModes[mode].hint}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {(values.phoneMode === "otp" || values.phoneMode === "unverified") && (
                <Field
                  id="phone"
                  label={text.phoneLabel}
                  hint={text.phoneHint}
                  error={errors.phone}
                >
                  <input
                    id="phone"
                    type="tel"
                    value={values.phone}
                    onChange={(e) => set({ phone: e.target.value })}
                    inputMode="tel"
                    autoComplete="off"
                    maxLength={20}
                    {...invalid("phone", errors)}
                    className="field tabular-nums"
                  />
                </Field>
              )}
            </>
          )}

          {step === "confirm" && (
            <section aria-labelledby="step-heading" className="space-y-5">
              <div className="space-y-2">
                <h2 id="step-heading" tabIndex={-1} className={QUESTION}>
                  {text.confirmTitle}
                </h2>
                <p className="text-ink-muted">{text.confirmHint}</p>
              </div>
              <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line text-card">
                <Row term={text.eventLabel}>{values.eventLabel}</Row>
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
                <Row term={text.verificationLabel}>
                  {phoneMode ? text.verificationValues[phoneMode] : ""}
                </Row>
                {values.phoneMode !== "none" && (
                  <Row term={text.phoneLabel}>
                    <span className="tabular-nums">{values.phone}</span>
                  </Row>
                )}
                <Row term={text.languageLabel}>{text.languages[values.language]}</Row>
              </dl>
              <div className="space-y-3">
                <Tick
                  name="readBackConfirmed"
                  checked={values.readBackConfirmed}
                  onChange={(readBackConfirmed) => set({ readBackConfirmed })}
                  label={text.readBackLabel}
                  error={errors.readBackConfirmed}
                />
                <Tick
                  name="adultDeclared"
                  checked={values.adultDeclared}
                  onChange={(adultDeclared) => set({ adultDeclared })}
                  label={text.adultLabel}
                  error={errors.adultDeclared}
                />
                <Tick
                  name="privacyAcknowledged"
                  checked={values.privacyAcknowledged}
                  onChange={(privacyAcknowledged) => set({ privacyAcknowledged })}
                  label={text.privacyLabel}
                  error={errors.privacyAcknowledged}
                  extra={
                    <a href={privacyUrl} target="_blank" rel="noopener">
                      {text.privacyLink}
                    </a>
                  }
                />
                <Tick
                  name="transferConsent"
                  checked={values.transferConsent}
                  onChange={(transferConsent) => set({ transferConsent })}
                  label={text.consentLabel}
                  hint={text.consentHint}
                  error={errors.transferConsent}
                />
              </div>
              {/* Every SMS the desk sends passes Turnstile (rule 8): the code, or the confirmation
                  to a number no code has checked. A fresh widget after every answer from the
                  server: a spent token is never reused. */}
              {values.phoneMode !== "none" && turnstileSiteKey && (
                <Turnstile key={attempt} siteKey={turnstileSiteKey} />
              )}
            </section>
          )}

          {step === "code" && (
            <Question
              id="code"
              label={text.codeLabel}
              hint={text.codeSent.replace("{phone}", values.phone)}
              error={errors.code}
            >
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                {...invalid("code", errors)}
                className="field max-w-[12ch] text-center text-subtitle tracking-[0.3em] tabular-nums"
              />
            </Question>
          )}
        </div>

        {/* The primary button comes first in the markup: pressing Enter submits it. */}
        <div className="mt-8 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row-reverse sm:items-center sm:justify-between">
          <DeskButton
            type="submit"
            busy={busy}
            intent={
              step === "confirm" && values.phoneMode === "otp"
                ? "send"
                : step === "confirm" || step === "code"
                  ? "submit"
                  : "next"
            }
            className={PRIMARY}
          >
            {step === "confirm"
              ? values.phoneMode === "otp"
                ? text.sendCode
                : text.submit
              : step === "code"
                ? text.submit
                : text.continue}
            <ArrowIcon />
          </DeskButton>
          {step !== "event" && step !== "code" && (
            <DeskButton
              busy={busy}
              className={BACK}
              onClick={() =>
                goTo(step === "member" ? "event" : step === "phone" ? "member" : "phone")
              }
            >
              <ArrowIcon className="rotate-180" />
              {text.back}
            </DeskButton>
          )}
          {step === "code" && (
            <DeskButton busy={busy} className={SECONDARY} onClick={() => goTo("confirm")}>
              {text.newCode}
            </DeskButton>
          )}
        </div>
      </form>
      {step !== "event" && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={startOver}
            disabled={pending}
            className="btn-text min-h-11 text-small text-ink-muted"
          >
            {text.startOver}
          </button>
        </div>
      )}
    </Card>
  );
}

/**
 * A button that shows a spinner and aria-busy while its own call is on the way; every other
 * button is disabled meanwhile, so nothing is sent twice (DESIGN.md §8, the Answered Press Rule).
 */
function DeskButton(props: {
  type?: "submit" | "button";
  intent?: string;
  busy: string | null;
  className: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  const mine = props.intent !== undefined && props.busy === props.intent;
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      disabled={props.busy !== null}
      aria-busy={mine || undefined}
      className={props.className}
    >
      {mine && <span aria-hidden="true" className="spinner" />}
      {props.children}
    </button>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="in-card -mx-4 border-y border-line bg-paper px-4 py-6 shadow-[0_1px_2px_rgb(10_20_51/0.04),0_16px_40px_-20px_rgb(10_20_51/0.18)] sm:mx-0 sm:rounded-[1.75rem] sm:border sm:p-8">
      {children}
    </div>
  );
}

// Shared control styles live in globals.css (@layer components).
const PRIMARY = "btn-primary w-full sm:w-auto sm:min-w-44";
const SECONDARY = "btn-secondary w-full sm:w-auto";
const BACK = "btn-text w-full justify-center sm:w-auto sm:justify-start sm:px-0";
const QUESTION = "text-subtitle outline-none";

function invalid(field: DeskErrorField, errors: DeskAnswer["errors"]) {
  return {
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": `${field}-hint ${field}-error`,
  } as const;
}

/** A step whose one question is its heading. */
function Question(props: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 id="step-heading" tabIndex={-1} className={QUESTION}>
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

/** One field among several on a step. */
function Field(props: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={props.id} className="block text-ink">
        {props.label}
      </label>
      {props.hint && (
        <p id={`${props.id}-hint`} className="text-small text-ink-muted">
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

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-3 rounded-xl bg-mist p-4">
      <InfoIcon className="mt-1 text-brand" />
      <span>{children}</span>
    </p>
  );
}

function Tick(props: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
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
          checked={props.checked}
          onChange={(e) => props.onChange(e.target.checked)}
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

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-ink-muted">{term}</dt>
      <dd className="sm:col-span-2">{children}</dd>
    </div>
  );
}
