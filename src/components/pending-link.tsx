"use client";

import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from "react";

/**
 * A plain link that shows it is working the moment it is pressed: a spinner and aria-busy until
 * the next page arrives. Registration pages render on the server and can take a moment on 3G, so
 * without this a tap looks ignored (#96).
 *
 * It stays a real `<a>`, never `<Link>`: Turnstile's CSP is set per page load (src/lib/csp.ts).
 * Without JavaScript it is an ordinary link.
 */
export function PendingLink({
  children,
  onClick,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const [pending, setPending] = useState(false);

  // Coming back with the browser's Back button can restore this page from memory with the
  // spinner still showing: clear it.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    // A new tab or window leaves this page where it is.
    const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.defaultPrevented || newTab || event.button !== 0) return;
    setPending(true);
  }

  return (
    <a {...props} onClick={handleClick} aria-busy={pending || undefined}>
      {children}
      {pending && <span aria-hidden="true" className="spinner" />}
    </a>
  );
}
