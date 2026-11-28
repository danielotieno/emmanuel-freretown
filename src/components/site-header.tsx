import Link from "next/link";
import type { ReactNode } from "react";
import crest from "./crest.webp";
import { LanguageSwitch } from "@/components/language-switch";
import { PendingLink } from "@/components/pending-link";
import type { Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

/**
 * The header on every public page: the parish lockup (crest and name, DESIGN.md §1), the main
 * navigation and the language switch. About is its own page (/about); the other links go to the
 * homepage's sections. The crest is the Diocese of Mombasa coat of arms, from a
 * scan, until the official file arrives (#87).
 *
 * The navigation is plain links with no JavaScript. On phones the links sit in a row under
 * the lockup rather than behind a menu button, so older members see them straight away. The row
 * wraps rather than scrolls, so every link stays on screen at 360px in both languages.
 */
export function SiteHeader({
  locale,
  onRegistration = false,
  onStatusCheck = false,
  onAbout = false,
}: {
  locale: Locale;
  /** On /registration the form's own button is the page's one solid pill, so Register is outlined. */
  onRegistration?: boolean;
  /** The status check (FR-7) has its own solid button too, so Register is outlined there as well. */
  onStatusCheck?: boolean;
  /** On /about the About link is marked as the current page. */
  onAbout?: boolean;
}) {
  const o = { locale };
  const current = onRegistration ? ("page" as const) : undefined;
  const outlined = onRegistration || onStatusCheck;
  const links = [
    ["/about", m.nav_about({}, o), onAbout],
    ["/#services", m.nav_services({}, o), false],
    ["/#ministries", m.nav_ministries({}, o), false],
    ["/#visit", m.nav_visit({}, o), false],
  ] as const;
  return (
    <header className="mx-auto w-full max-w-content px-4 pt-4 sm:px-6 sm:pt-6 lg:px-10">
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
            <span className="block font-display text-[1.375rem] leading-none tracking-[-0.01em]">
              {m.site_name_short({}, o)}
            </span>
            <span className="mt-1 block truncate text-small text-ink-muted">
              {m.site_name_place({}, o)}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <NavLinks label={m.nav_label({}, o)} links={links} className="hidden md:block" />
          {/* A plain link, not <Link>: Turnstile's CSP is set per page load (src/lib/csp.ts).
              The site's one solid blue pill: registering is what the site exists for (DESIGN.md §2),
              except on /registration itself, where the form's button takes that place. */}
          <PendingLink
            href="/registration"
            aria-current={current}
            className={`hidden min-h-11 items-center gap-2 rounded-full px-5 text-button no-underline transition-[background-color,transform] duration-150 select-none active:scale-[0.98] md:inline-flex ${
              outlined
                ? "border border-brand bg-paper text-brand hover:bg-mist"
                : "bg-brand text-paper hover:bg-brand-deep"
            }`}
          >
            {m.nav_register({}, o)}
          </PendingLink>
          <LanguageSwitch locale={locale} />
        </div>
      </div>
      <NavLinks label={m.nav_label({}, o)} links={links} className="mt-3 md:hidden">
        <li className="sm:ml-auto">
          <PendingLink
            href="/registration"
            aria-current={current}
            className="inline-flex min-h-11 items-center gap-2 px-1.5 text-button text-brand underline underline-offset-4 sm:px-2"
          >
            {m.nav_register({}, o)}
          </PendingLink>
        </li>
      </NavLinks>
    </header>
  );
}

/** The section links, used for both the phone row and the wide-screen bar. */
function NavLinks(props: {
  label: string;
  links: readonly (readonly [string, string, boolean])[];
  className: string;
  children?: ReactNode;
}) {
  const { label, links, className, children } = props;
  return (
    <nav aria-label={label} className={className}>
      <ul className="-mx-1.5 flex flex-wrap items-center text-button font-normal sm:-mx-2 sm:gap-x-1 md:mx-0">
        {links.map(([href, text, current]) => (
          <li key={href}>
            <a
              href={href}
              aria-current={current ? "page" : undefined}
              className="inline-flex min-h-11 items-center rounded-full px-1.5 text-ink-muted no-underline transition-colors hover:text-ink aria-[current=page]:text-ink sm:px-2 md:px-3 md:hover:bg-cloud"
            >
              {text}
            </a>
          </li>
        ))}
        {children}
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
