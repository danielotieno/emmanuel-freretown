import { cookieName, isLocale, locales, type Locale } from "../paraglide/runtime";

export type { Locale };
export { locales };

/** The cookie that remembers a visitor's language choice (NFR-5). */
export const LOCALE_COOKIE = cookieName;

/**
 * Language shown on a first visit, before the visitor chooses. Kiswahili, matching the
 * registry's default language (member.language DEFAULT 'sw' in database-design.md).
 */
export const DEFAULT_LOCALE: Locale = "sw";

/** The visitor's saved choice if it is a supported locale, otherwise the default. */
export function resolveLocale(saved: unknown): Locale {
  return isLocale(saved) ? saved : DEFAULT_LOCALE;
}
