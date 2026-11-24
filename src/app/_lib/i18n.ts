import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "@/i18n/locale";

/**
 * The request's locale, read once per request. Pass it explicitly to message functions:
 * `m.landing_welcome({}, { locale })`. This avoids relying on global locale state,
 * which is not request-scoped in React Server Components.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  return resolveLocale(store.get(LOCALE_COOKIE)?.value);
});
