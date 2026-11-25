import Link from "next/link";
import crest from "./crest.webp";
import { LanguageSwitch } from "@/components/language-switch";
import type { Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

/**
 * The header on every public page: the parish lockup (crest and name, DESIGN.md §1) and the
 * language switch. The crest is the Diocese of Mombasa coat of arms, from a scan, until the
 * official file arrives (#28).
 */
export function SiteHeader({ locale }: { locale: Locale }) {
  return (
    <header className="mx-auto flex max-w-content items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
      <Link
        href="/"
        prefetch={false}
        className="flex min-w-0 items-center gap-3 text-ink no-underline"
      >
        <Crest className="h-10 w-auto shrink-0 sm:h-11" />
        {/* Read as the full name, in one piece; the two visual lines are hidden from readers. */}
        <span className="sr-only">{m.site_name({}, { locale })}</span>
        <span aria-hidden="true" className="min-w-0 leading-tight">
          <span className="block font-display text-lg tracking-tight sm:text-xl">
            {m.site_name_short({}, { locale })}
          </span>
          <span className="block truncate text-xs text-ink-muted sm:text-sm">
            {m.site_name_place({}, { locale })}
          </span>
        </span>
      </Link>
      <LanguageSwitch locale={locale} />
    </header>
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
