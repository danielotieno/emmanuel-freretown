import Link from "next/link";
import { Crest } from "@/components/site-header";
import type { Locale } from "@/i18n/locale";
import { CHURCH_OFFICE } from "@/lib/church-office";
import { m } from "@/paraglide/messages";

/**
 * Footer on every public page, always on Black: the parish lockup, the way around the site, what
 * members come for, the church office (so help is one call away on registration too), the
 * parish's name set large, and the privacy notice, terms and cookies (NFR-10). No prefetching:
 * these pages are rarely opened, and members are often on mobile data. Links into /registration
 * are plain `<a>`: Turnstile's CSP is set per page load (src/lib/csp.ts).
 */
export function SiteFooter({ locale }: { locale: Locale }) {
  const o = { locale };
  const explore = [
    ["/about", m.nav_about({}, o)],
    ["/#services", m.home_services_title({}, o)],
    ["/#week", m.home_week_title({}, o)],
    ["/#ministries", m.home_ministries_title({}, o)],
    ["/#hbcs", m.home_hbc_title({}, o)],
    ["/#visit", m.home_visit_title({}, o)],
  ] as const;
  const members = [
    ["/registration", m.reg_title({}, o)],
    ["/registration/status", m.status_title({}, o)],
  ] as const;
  const legal = [
    ["/privacy", m.footer_privacy({}, o)],
    ["/terms", m.footer_terms({}, o)],
    ["/cookies", m.footer_cookies({}, o)],
  ] as const;
  return (
    <footer className="on-dark mt-24 overflow-hidden bg-night text-paper md:mt-36">
      <div className="mx-auto max-w-content px-4 pt-14 pb-8 sm:px-6 md:pt-20 lg:px-10">
        <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-12">
          <div className="flex items-start gap-4 sm:col-span-2 lg:col-span-4">
            <Crest className="h-14 w-auto shrink-0" />
            <div className="max-w-[30ch]">
              <p className="text-subtitle text-balance text-paper">{m.site_name({}, o)}</p>
              <p className="mt-3 text-card text-sky">{m.footer_tagline({}, o)}</p>
            </div>
          </div>
          <nav aria-label={m.footer_site_nav_label({}, o)} className="lg:col-span-2 lg:col-start-6">
            <h2 className={COLUMN_TITLE}>{m.footer_explore({}, o)}</h2>
            <ul className="mt-2">
              {explore.map(([href, text]) => (
                <li key={href}>
                  <Link href={href} prefetch={false} className={COLUMN_LINK}>
                    {text}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="lg:col-span-2">
            <h2 className={COLUMN_TITLE}>{m.footer_members({}, o)}</h2>
            <ul className="mt-2">
              {members.map(([href, text]) => (
                <li key={href}>
                  <a href={href} className={COLUMN_LINK}>
                    {text}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:col-span-3">
            <h2 className={COLUMN_TITLE}>{m.home_visit_office({}, o)}</h2>
            <ul className="mt-2">
              <li>
                <a href={CHURCH_OFFICE.phoneHref} className={`${COLUMN_LINK} tabular-nums`}>
                  {CHURCH_OFFICE.phone}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${CHURCH_OFFICE.email}`}
                  className={`${COLUMN_LINK} wrap-anywhere`}
                >
                  {CHURCH_OFFICE.email}
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* The parish's short name, as wide as the page: decoration, drawn as a picture and
            hidden from readers. textLength keeps it edge to edge whichever font has loaded. */}
        <svg
          viewBox="0 0 353 78"
          aria-hidden="true"
          focusable="false"
          className="mt-14 w-full text-night-soft select-none md:mt-20"
        >
          <text
            x="0"
            y="76"
            textLength="353"
            lengthAdjust="spacingAndGlyphs"
            fill="currentColor"
            className="font-display text-[100px]"
          >
            Emmanuel
          </text>
        </svg>

        <div className="mt-8 flex flex-col gap-x-8 gap-y-2 border-t border-night-soft pt-5 md:flex-row md:items-center md:justify-between">
          <p className="text-small text-sky tabular-nums">
            {m.footer_copyright({ year: new Date().getFullYear() }, o)}
          </p>
          <nav aria-label={m.footer_nav_label({}, o)}>
            <ul className="-mx-2 flex flex-wrap gap-x-4 text-small">
              {legal.map(([href, text]) => (
                <li key={href}>
                  <Link
                    href={href}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center px-2 text-sky no-underline transition-colors hover:text-paper"
                  >
                    {text}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}

const COLUMN_TITLE = "font-sans text-small font-normal tracking-normal text-sky";

const COLUMN_LINK =
  "inline-flex min-h-11 items-center text-card text-paper no-underline transition-colors hover:text-sky";
