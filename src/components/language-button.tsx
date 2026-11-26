"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * One button of the language switch. While the switch is posting, the chosen language shows a
 * spinner in place of its label, so the tap is answered at once (#96). Without JavaScript it is
 * a plain submit button.
 */
export function LanguageButton(props: {
  value: string;
  current: boolean;
  label: string;
  children: ReactNode;
}) {
  const { pending, data } = useFormStatus();
  const chosen = pending && data?.get("locale") === props.value;
  return (
    <button
      type="submit"
      name="locale"
      value={props.value}
      lang={props.value}
      aria-pressed={props.current}
      aria-busy={chosen || undefined}
      className={`relative grid min-h-8 min-w-11 place-items-center rounded-full px-2.5 transition-colors before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] ${
        props.current ? "bg-ink text-paper" : "text-ink-muted hover:text-ink"
      }`}
    >
      {/* The label keeps its space while the spinner shows, so the pill never changes width. */}
      <span className={chosen ? "invisible" : undefined}>{props.label}</span>
      {chosen && <span aria-hidden="true" className="spinner absolute size-3.5" />}
      {props.children}
    </button>
  );
}
