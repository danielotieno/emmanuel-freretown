import { cookieName, isLocale, locales, type Locale } from "../paraglide/runtime";

export type { Locale };
export { locales };

/** The cookie that remembers a visitor's language choice (NFR-5). */
export const LOCALE_COOKIE = cookieName;

/**
 * Language shown on a first visit, before the visitor chooses: English, the language every
 * message exists in (D44). Kiswahili is one tap away and remembered (#80). A registration
 * records the language the member actually used, whatever this default is.
 */
export const DEFAULT_LOCALE: Locale = "en";

/** The visitor's saved choice if it is a supported locale, otherwise the default. */
export function resolveLocale(saved: unknown): Locale {
  return isLocale(saved) ? saved : DEFAULT_LOCALE;
}
