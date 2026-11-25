import type { Metadata } from "next";
import { getLocale } from "@/app/_lib/i18n";
import { LegalPage } from "@/components/legal-page";
import { m } from "@/paraglide/messages";
import { COOKIES_VERSION } from "../legal-versions";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `${m.cookies_title({}, { locale })} · ${m.site_name({}, { locale })}` };
}

/** The cookies the site sets (#27). Only those needed to work and stay secure. */
export default async function CookiesPage() {
  const locale = await getLocale();
  // The body is English whatever the page language (D44); the title follows the visitor's.
  const en = { locale: "en" } as const;
  return (
    <LegalPage
      locale={locale}
      title={m.cookies_title({}, { locale })}
      version={COOKIES_VERSION}
      intro={m.cookies_intro({}, en)}
      sections={[
        { heading: m.cookies_ours_heading({}, en), list: m.cookies_ours_body({}, en) },
        { heading: m.cookies_security_heading({}, en), intro: m.cookies_security_body({}, en) },
        { heading: m.cookies_control_heading({}, en), intro: m.cookies_control_body({}, en) },
      ]}
    />
  );
}
