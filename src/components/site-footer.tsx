import Link from "next/link";
import { Crest } from "@/components/site-header";
import type { Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

/**
 * Footer on every public page: the parish lockup and the privacy notice, terms and cookies
 * (NFR-10). No prefetching: these pages are rarely opened, and members are often on mobile data.
 */
export function SiteFooter({ locale }: { locale: Locale }) {
  const o = { locale };
  return (
    <footer className="mt-16 bg-sand">
      <div className="mx-auto flex max-w-content flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-end md:justify-between">
        <div className="flex items-start gap-3">
          <Crest className="h-12 w-auto shrink-0" />
          <div className="max-w-[34ch]">
            <p className="font-display text-xl leading-tight text-ink">{m.site_name({}, o)}</p>
            <p className="mt-1 text-sm text-ink-muted">{m.footer_tagline({}, o)}</p>
          </div>
        </div>
        <nav aria-label={m.footer_nav_label({}, o)}>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <li>
              <Link href="/privacy" prefetch={false} className="text-ink-muted hover:text-ink">
                {m.footer_privacy({}, o)}
              </Link>
            </li>
            <li>
              <Link href="/terms" prefetch={false} className="text-ink-muted hover:text-ink">
                {m.footer_terms({}, o)}
              </Link>
            </li>
            <li>
              <Link href="/cookies" prefetch={false} className="text-ink-muted hover:text-ink">
                {m.footer_cookies({}, o)}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
