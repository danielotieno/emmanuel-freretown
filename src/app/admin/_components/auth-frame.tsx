import type { ReactNode } from "react";
import { Crest } from "@/components/site-header";
import { m } from "@/paraglide/messages";

/**
 * The frame for the pages a staff member sees before the portal opens: sign-in, setting up an
 * authenticator app and replacing a temporary password. The parish name, then one narrow form.
 */
export function AuthFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="main" className="mx-auto min-h-dvh max-w-form px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <p className="flex items-center gap-3">
        <Crest className="h-10 w-auto shrink-0" />
        <span className="leading-tight">
          <span className="block font-display text-xl leading-none">
            {m.site_name_short({}, { locale: "en" })}
          </span>
          <span className="mt-1 block text-xs text-ink-muted">Staff portal</span>
        </span>
      </p>
      <h1 className="mt-12 text-title">{title}</h1>
      {children}
    </main>
  );
}
