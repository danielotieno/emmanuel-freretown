"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/i18n/locale";
import { isLocale } from "@/paraglide/runtime";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Saves the visitor's language choice. Works without JavaScript (plain form post). */
export async function setLanguage(formData: FormData): Promise<void> {
  const locale = formData.get("locale");
  if (!isLocale(locale)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    // Not httpOnly: a language preference is not sensitive, and client components need it.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
}
