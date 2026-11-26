import Link from "next/link";
import { Crest } from "@/components/site-header";
import type { Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

/**
 * Footer on every public page, always on Midnight (#96): the parish lockup, the church office
 * (so help is one call away on registration too), and the privacy notice, terms and cookies
 * (NFR-10). No prefetching: these pages are rarely opened, and members are often on mobile data.
 */
export function SiteFooter({ locale }: { locale: Locale }) {
  const o = { locale };
  return (
    <footer className="on-dark mt-20 bg-night text-paper md:mt-28">
      <div className="mx-auto max-w-content px-4 pt-14 pb-10 sm:px-6 md:pt-20 lg:px-10">
        <div className="grid gap-10 md:grid-cols-12 md:gap-8">
          <div className="flex items-start gap-4 md:col-span-5">
            <Crest className="h-14 w-auto shrink-0" />
            <div className="max-w-[30ch]">
              <p className="font-display text-2xl leading-tight text-paper">{m.site_name({}, o)}</p>
              <p className="mt-2 text-sky">{m.footer_tagline({}, o)}</p>
            </div>
          </div>
          <div className="md:col-span-4 md:col-start-9">
            <h2 className="font-sans text-base tracking-normal text-sky">
              {m.home_visit_office({}, o)}
            </h2>
            <ul className="mt-3 space-y-1.5">
              <li>
                <a href="tel:+254790255515" className="text-paper tabular-nums hover:text-sky">
                  +254 790 255515
                </a>
              </li>
              <li>
                <a
                  href="mailto:ackemmanuelkengeleni@gmail.com"
                  className="break-words text-paper hover:text-sky"
                >
                  ackemmanuelkengeleni@gmail.com
                </a>
              </li>
            </ul>
          </div>
        </div>
        <nav
          aria-label={m.footer_nav_label({}, o)}
          className="mt-12 border-t border-night-soft pt-6 md:mt-16"
        >
          <ul className="-mx-2 flex flex-wrap gap-x-4 text-sm">
            <li>
              <Link
                href="/privacy"
                prefetch={false}
                className="inline-flex min-h-11 items-center px-2 text-sky hover:text-paper"
              >
                {m.footer_privacy({}, o)}
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                prefetch={false}
                className="inline-flex min-h-11 items-center px-2 text-sky hover:text-paper"
              >
                {m.footer_terms({}, o)}
              </Link>
            </li>
            <li>
              <Link
                href="/cookies"
                prefetch={false}
                className="inline-flex min-h-11 items-center px-2 text-sky hover:text-paper"
              >
                {m.footer_cookies({}, o)}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
