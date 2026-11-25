import Link from "next/link";
import type { Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

/**
 * Footer on every public page: the privacy notice, terms and cookies (NFR-10). No prefetching:
 * these pages are rarely opened, and members are often on mobile data.
 */
export function SiteFooter({ locale }: { locale: Locale }) {
  const o = { locale };
  return (
    <footer className="mx-auto max-w-content border-t border-line px-4 py-6 sm:px-6">
      <nav aria-label={m.footer_nav_label({}, o)}>
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          <li>
            <Link href="/privacy" prefetch={false}>
              {m.footer_privacy({}, o)}
            </Link>
          </li>
          <li>
            <Link href="/terms" prefetch={false}>
              {m.footer_terms({}, o)}
            </Link>
          </li>
          <li>
            <Link href="/cookies" prefetch={false}>
              {m.footer_cookies({}, o)}
            </Link>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
