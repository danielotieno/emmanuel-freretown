"use server";

import { cookies, headers } from "next/headers";
import { isSecureCookieHost } from "@/lib/hosts";
import { LOCALE_COOKIE } from "@/i18n/locale";
import { isLocale } from "@/paraglide/runtime";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Saves the visitor's language choice. Works without JavaScript (plain form post). */
export async function setLanguage(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;

  const [store, requestHeaders] = await Promise.all([cookies(), headers()]);
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    // Not httpOnly: a language preference is not sensitive, and client components need it.
    httpOnly: false,
    // Secure everywhere except loopback hosts, where local builds and E2E run over http.
    secure: isSecureCookieHost(requestHeaders.get("host")),
  });
}
