"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertIcon } from "@/components/icons";
import { searchAction } from "./actions";
import { MemberList } from "./member-list";

/**
 * Search by name, FWO number or mobile number (FR-6). The terms are posted to a server action
 * and kept only in this page's memory, never in the URL (rule 2); each search is recorded with
 * its number of results (D31).
 */
export function SearchForm() {
  const [state, action] = useActionState(searchAction, {});
  return (
    <section aria-labelledby="search-heading" className="mt-8">
      <h2 id="search-heading" className="text-subtitle">
        Find a member
      </h2>
      <form
        action={action}
        role="search"
        className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-1.5">
          <label htmlFor="member-query" className="block text-small text-ink-muted">
            Name, FWO number or mobile number
          </label>
          <input
            id="member-query"
            name="query"
            type="search"
            defaultValue={state.query}
            maxLength={120}
            autoComplete="off"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "member-query-error" : undefined}
            className="field"
          />
        </div>
        <Submit />
      </form>
      {state.error && (
        <p id="member-query-error" className="mt-3 flex gap-2 text-error">
          <AlertIcon className="mt-1" />
          <span>{state.error}</span>
        </p>
      )}
      {state.items && (
        <>
          <p className="mt-4 text-small text-ink-muted" aria-live="polite">
            {state.total === 0
              ? "No member matches."
              : state.items.length < (state.total ?? 0)
                ? `Showing ${state.items.length} of ${state.total} matches. Type more to narrow it down.`
                : `${state.total} ${state.total === 1 ? "match" : "matches"}.`}
          </p>
          <MemberList items={state.items} />
        </>
      )}
    </section>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="btn-primary"
    >
      {pending && <span aria-hidden="true" className="spinner" />}
      Search
    </button>
  );
}
