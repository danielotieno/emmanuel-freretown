"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon, PlusIcon } from "@/components/icons";
import { approveAction, correctionAction, rejectAction, type DecisionState } from "./actions";

/**
 * The three decisions (FR-4): approve, reject with a reason, ask for a correction with a reason.
 * Plain forms posting to server actions, so they work before the page's JavaScript runs. Each
 * carries the version the administrator saw: if someone else acted first, the action fails and
 * says so (FR-4).
 */
export function DecisionForms(props: {
  registrationId: string;
  version: number;
  /** Why approval is blocked now, if it is; the server checks again. */
  approvalBlocks: string[];
  hasPhone: boolean;
  /**
   * False once the registration is no longer waiting for review. The forms stay mounted, so a
   * refusal's message ("someone else acted first") survives the page showing the latest state.
   */
  open: boolean;
  statusName: string;
}) {
  const [approved, approve] = useActionState(approveAction, {});
  const [rejected, reject] = useActionState(rejectAction, {});
  const [corrected, correct] = useActionState(correctionAction, {});
  const hidden = (
    <>
      <input type="hidden" name="registrationId" value={props.registrationId} />
      <input type="hidden" name="version" value={props.version} />
    </>
  );
  const blocked = props.approvalBlocks.length > 0;

  if (!props.open) {
    const message = approved.error ?? rejected.error ?? corrected.error;
    return (
      <section aria-labelledby="decide-heading" className="mt-10 space-y-3">
        <h2 id="decide-heading" className="text-subtitle">
          Decision
        </h2>
        <ErrorBox message={message} />
        <p className="text-ink-muted">{props.statusName}: there is nothing more to decide here.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="decide-heading" className="mt-10">
      <h2 id="decide-heading" className="text-subtitle">
        Decision
      </h2>
      <div className="in-card mt-3 space-y-6 rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <form action={approve} className="space-y-4">
          {hidden}
          <ErrorBox message={approved.error} />
          {blocked ? (
            <ul className="space-y-2">
              {props.approvalBlocks.map((b) => (
                <li key={b} className="flex gap-3 rounded-xl bg-mist p-4">
                  <AlertIcon className="mt-1 text-error" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-muted">
              Approving creates the member record with this HBC and the declared departments
              {props.hasPhone ? ", and sends the member an SMS" : ""}.
            </p>
          )}
          <Submit className="btn-primary w-full sm:w-auto" disabled={blocked}>
            Approve
          </Submit>
        </form>

        <ReasonForm
          title="Ask for a correction"
          hint={`The reason is for staff only.${props.hasPhone ? " The member gets an SMS asking them to contact the church office." : ""}`}
          action={correct}
          state={corrected}
          hidden={hidden}
          button="Ask for a correction"
          id="correction"
        />
        <ReasonForm
          title="Reject"
          hint="The reason is for staff only. The member gets no SMS. Use this for a duplicate or an FWO already held by a member (D33)."
          action={reject}
          state={rejected}
          hidden={hidden}
          button="Reject"
          id="reject"
        />
      </div>
    </section>
  );
}

function ReasonForm(props: {
  id: string;
  title: string;
  hint: string;
  button: string;
  action: (form: FormData) => void;
  state: DecisionState;
  hidden: ReactNode;
}) {
  const invalid = !!props.state.reasonError;
  return (
    <details
      data-decision={props.id}
      className="group/why rounded-xl border border-line bg-cloud px-4"
      open={invalid || !!props.state.error || undefined}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-ink [&::-webkit-details-marker]:hidden">
        {props.title}
        <PlusIcon className="text-brand transition-transform duration-200 group-open/why:rotate-45" />
      </summary>
      <form action={props.action} className="space-y-3 pb-4">
        {props.hidden}
        <ErrorBox message={props.state.error} />
        <label htmlFor={`${props.id}-reason`} className="block text-ink">
          Reason
        </label>
        <p id={`${props.id}-hint`} className="text-small text-ink-muted">
          {props.hint}
        </p>
        {invalid && (
          <p id={`${props.id}-error`} className="flex gap-2 text-error">
            <AlertIcon className="mt-1" />
            <span>{props.state.reasonError}</span>
          </p>
        )}
        <textarea
          id={`${props.id}-reason`}
          name="reason"
          rows={3}
          maxLength={500}
          aria-invalid={invalid || undefined}
          aria-describedby={`${props.id}-hint${invalid ? ` ${props.id}-error` : ""}`}
          className="field min-h-24 py-3"
        />
        <Submit className="btn-secondary w-full sm:w-auto">{props.button}</Submit>
      </form>
    </details>
  );
}

/** A submit button with a spinner while its own form posts (DESIGN.md §8). */
function Submit(props: { className: string; disabled?: boolean; children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || props.disabled}
      aria-busy={pending || undefined}
      className={props.className}
    >
      {pending && <span aria-hidden="true" className="spinner" />}
      {props.children}
    </button>
  );
}

function ErrorBox({ message }: { message?: string }) {
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
