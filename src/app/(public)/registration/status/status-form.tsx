"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { AlertIcon, ArrowIcon, BellIcon, CheckIcon, InfoIcon } from "@/components/icons";
import { Turnstile } from "@/components/turnstile";
import {
  BACK,
  FormShell,
  INPUT,
  invalid,
  Notice,
  PRIMARY,
  Question,
  QUESTION,
  SECONDARY,
  SubmitButton,
  useScripted,
} from "../form-parts";
import { statusStep } from "./actions";
import { EMPTY_STATUS_VALUES, type StatusOutcome, type StatusState } from "./state";
import type { StatusText } from "./text";

const INITIAL: StatusState = {
  step: "details",
  values: EMPTY_STATUS_VALUES,
  errors: {},
  attempt: 0,
};

/**
 * The membership status check (FR-7): phone and FWO number or reference, then a code, then the
 * answer. A plain form posting to a server action, like self-registration, so it works without
 * JavaScript until the code is sent, where Turnstile needs it. Turnstile loads only on the step
 * that sends the code, so the first load stays light (NFR-2).
 */
export function StatusForm({
  text,
  turnstileSiteKey,
}: {
  text: StatusText;
  turnstileSiteKey: string;
}) {
  const [state, formAction, pending] = useActionState(statusStep, INITIAL);
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

  return (
    <FormShell
      title={text.title}
      intro={text.intro}
      started={step !== "details"}
      help={{ title: text.helpTitle, body: text.helpBody }}
      panel={<BellIcon className="h-16 w-auto text-gold" />}
    >
      <div>
        {step === "result" && state.outcome ? (
          <Result text={text} outcome={state.outcome} />
        ) : (
          <form action={formAction} noValidate aria-busy={pending || undefined} className="group">
            <input type="hidden" name="step" value={step} />
            {state.challengeId && (
              <input type="hidden" name="challengeId" value={state.challengeId} />
            )}
            {step !== "details" && (
              <>
                <input type="hidden" name="phone" value={values.phone} />
                <input type="hidden" name="key" value={values.key} />
              </>
            )}

            <div className="space-y-7 transition-opacity duration-200 group-aria-busy:opacity-55">
              <Notice message={state.notice} />

              {step === "details" && (
                <>
                  <Question
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
                  </Question>
                  <Question
                    id="key"
                    label={text.keyLabel}
                    hint={text.keyHint}
                    error={errors.key}
                    heading={false}
                  >
                    <input
                      id="key"
                      name="key"
                      defaultValue={values.key}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={20}
                      {...invalid("key", errors)}
                      className={`${INPUT} tabular-nums`}
                    />
                  </Question>
                </>
              )}

              {step === "review" && (
                <section aria-labelledby="step-heading" className="space-y-5">
                  <h2 id="step-heading" tabIndex={-1} className={QUESTION}>
                    {text.reviewTitle}
                  </h2>
                  <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
                    <Row term={text.phoneLabel}>{values.phone}</Row>
                    <Row term={text.keyLabel}>{values.key}</Row>
                  </dl>
                  <p className="text-ink-muted">{text.reviewHint}</p>
                  {/* A fresh widget after every answer: a spent token is never reused. */}
                  {turnstileSiteKey && <Turnstile key={state.attempt} siteKey={turnstileSiteKey} />}
                  {(!scripted || !turnstileSiteKey) && (
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

            {/* The primary button comes first in the markup: pressing Enter submits it. */}
            <div className="mt-10 flex flex-col gap-3 sm:flex-row-reverse sm:items-center sm:justify-between">
              <SubmitButton intent="next" className={PRIMARY}>
                {step === "review" ? text.sendCode : step === "code" ? text.check : text.continue}
                <ArrowIcon />
              </SubmitButton>
              {step === "review" && (
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
        )}
      </div>
    </FormShell>
  );
}

/**
 * FR-7's answers. A match shows the status, the name and the HBC on record (D14, D48); every
 * non-match shows the one same message, with a link to register.
 */
function Result({ text, outcome }: { text: StatusText; outcome: StatusOutcome }) {
  // Plain links, not <Link>: a client-side navigation would keep this page's policy (CSP).
  const again = (
    <a href="/registration/status" className={SECONDARY}>
      {text.checkAgain}
    </a>
  );

  if (outcome.status === "RECEIVED" || outcome.status === "REGISTERED_MEMBER") {
    const member = outcome.status === "REGISTERED_MEMBER";
    return (
      <section aria-labelledby="step-heading" className="space-y-6">
        <span
          aria-hidden="true"
          className={`grid size-14 place-items-center rounded-full text-paper ${
            member ? "bg-success" : "bg-brand"
          }`}
        >
          <CheckIcon size="size-7" />
        </span>
        <h2 id="step-heading" tabIndex={-1} className={QUESTION}>
          {member ? text.memberTitle : text.receivedTitle}
        </h2>
        <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          <Row term={text.nameLabel}>{outcome.fullName}</Row>
          <Row term={text.hbcLabel}>{outcome.hbcName ?? text.hbcToBeSet}</Row>
        </dl>
        <p className="flex gap-3 rounded-xl bg-mist p-4 text-ink">
          <InfoIcon className="mt-1 text-brand" />
          <span>{text.wrongNote}</span>
        </p>
        <div className="border-t border-line pt-6">{again}</div>
      </section>
    );
  }

  return (
    <section aria-labelledby="step-heading" className="space-y-6">
      <span
        aria-hidden="true"
        className="grid size-14 place-items-center rounded-full bg-mist text-[1.5rem] text-brand"
      >
        <AlertIcon />
      </span>
      <h2 id="step-heading" tabIndex={-1} className={QUESTION}>
        {outcome.status === "CONTACT_OFFICE" ? text.contactTitle : text.notFound}
      </h2>
      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
        {outcome.status === "NOT_FOUND" && (
          <a href="/registration" className={PRIMARY}>
            {text.registerLink}
            <ArrowIcon />
          </a>
        )}
        {again}
      </div>
    </section>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-3 sm:gap-4">
      <dt className="text-ink-muted">{term}</dt>
      <dd className="sm:col-span-2 tabular-nums">{children}</dd>
    </div>
  );
}
