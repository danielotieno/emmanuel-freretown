import type { ReactNode } from "react";

/**
 * Icons (DESIGN.md §8): one 24px grid, 1.75 stroke, round caps and joins, in the current colour,
 * drawn here so no page loads an icon library. Always `aria-hidden`, beside words that carry the
 * meaning.
 */

function Icon(props: { className?: string; size?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${props.size ?? "size-5"} ${props.className ?? ""}`}
    >
      {props.children}
    </svg>
  );
}

export function ArrowIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function CheckIcon({ size }: { size: string }) {
  return (
    <Icon size={size}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Icon>
  );
}

export function ChevronIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function PlusIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function AlertIcon({ className }: { className?: string }) {
  return (
    <Icon size="size-[1.1em]" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5v.01" />
    </Icon>
  );
}

export function InfoIcon({ className }: { className?: string }) {
  return (
    <Icon size="size-[1.1em]" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.5v.01" />
    </Icon>
  );
}

/** The bell that gave Kengeleni its name, drawn as a single line (DESIGN.md §1). Decorative. */
export function BellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 52"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M16 4h16M24 4v6" />
      <path d="M24 10c-8 0-12 7-12 17v7l-4 6h32l-4-6v-7c0-10-4-17-12-17Z" />
      <path d="M18 18c1.5-2 3.5-3 6-3" />
      <circle cx="24" cy="45" r="3.5" />
    </svg>
  );
}

/** Facebook's "f", for the link to the parish's page. Decorative: the link's words name it. */
export function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={`size-6 shrink-0 ${className ?? ""}`}
    >
      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.5V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.500V21h3Z" />
    </svg>
  );
}

/** YouTube's play mark, for the link to the live services. Decorative. */
export function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={`size-6 shrink-0 ${className ?? ""}`}
    >
      <path
        fillRule="evenodd"
        d="M5.2 5.500h13.6A2.7 2.7 0 0 1 21.5 8.2v7.6a2.7 2.7 0 0 1-2.7 2.7H5.2a2.7 2.7 0 0 1-2.7-2.7V8.2a2.7 2.7 0 0 1 2.7-2.7Zm4.8 3.6v5.8l5-2.9-5-2.9Z"
      />
    </svg>
  );
}
