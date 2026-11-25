import Link from "next/link";
import crest from "./crest.webp";
import { LanguageSwitch } from "@/components/language-switch";
import type { Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

/**
 * The header on every public page: the parish lockup (crest and name, DESIGN.md §1), the main
 * navigation and the language switch. The crest is the Diocese of Mombasa coat of arms, from a
 * scan, until the official file arrives (#28).
 *
 * The navigation is plain links with no JavaScript. On phones the links sit in a row under
 * the lockup rather than behind a menu button, so older members see them straight away.
 */
export function SiteHeader({ locale }: { locale: Locale }) {
  const o = { locale };
  const links = [
    ["/#about", m.nav_about({}, o)],
    ["/#services", m.nav_services({}, o)],
    ["/#ministries", m.nav_ministries({}, o)],
    ["/#visit", m.nav_visit({}, o)],
  ] as const;
  return (
    <header className="mx-auto max-w-content px-4 pt-4 sm:px-6 sm:pt-5">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/"
          prefetch={false}
          className="flex min-w-0 items-center gap-3 text-ink no-underline"
        >
          <Crest className="h-10 w-auto shrink-0 sm:h-11" />
          {/* Read as the full name, in one piece; the two visual lines are hidden from readers. */}
          <span className="sr-only">{m.site_name({}, o)}</span>
          <span aria-hidden="true" className="min-w-0 leading-tight">
            <span className="block font-display text-lg tracking-tight sm:text-xl">
              {m.site_name_short({}, o)}
            </span>
            <span className="block truncate text-xs text-ink-muted sm:text-sm">
              {m.site_name_place({}, o)}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <NavLinks label={m.nav_label({}, o)} links={links} className="hidden md:flex" />
          {/* A plain link, not <Link>: Turnstile's CSP is set per page load (src/lib/csp.ts). */}
          <a
            href="/registration"
            className="hidden min-h-10 items-center rounded-full bg-brand px-5 text-sm text-paper no-underline hover:bg-brand-deep md:inline-flex"
          >
            {m.nav_register({}, o)}
          </a>
          <LanguageSwitch locale={locale} />
        </div>
      </div>
      <nav aria-label={m.nav_label({}, o)} className="-mx-4 mt-3 overflow-x-auto px-4 md:hidden">
        <ul className="flex items-center gap-1 text-[0.9375rem] whitespace-nowrap">
          {links.map(([href, label]) => (
            <li key={href}>
              <a
                href={href}
                className="inline-flex min-h-10 items-center px-2 text-ink-muted no-underline hover:text-ink"
              >
                {label}
              </a>
            </li>
          ))}
          <li className="ml-auto">
            <a
              href="/registration"
              className="inline-flex min-h-10 items-center px-2 text-brand underline underline-offset-4"
            >
              {m.nav_register({}, o)}
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}

/** The section links for wide screens. */
function NavLinks(props: {
  label: string;
  links: readonly (readonly [string, string])[];
  className: string;
}) {
  const { label, links, className } = props;
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex items-center gap-1 text-[0.9375rem]">
        {links.map(([href, label]) => (
          <li key={href}>
            <a
              href={href}
              className="inline-flex min-h-10 items-center px-3 text-ink-muted no-underline hover:text-ink"
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The crest image. Decorative: the parish name always stands beside it. */
export function Crest({ className }: { className?: string }) {
  return (
    // A plain <img>: Next's image optimiser doesn't run on Cloudflare (DESIGN.md §5).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={crest.src}
      width={crest.width}
      height={crest.height}
      alt=""
      decoding="async"
      className={className}
    />
  );
}
