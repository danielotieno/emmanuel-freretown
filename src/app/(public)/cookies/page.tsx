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
  const t = (message: (inputs: object, options: { locale: "en" }) => string) =>
    message({}, { locale: "en" });
  return (
    <LegalPage
      locale={locale}
      title={m.cookies_title({}, { locale })}
      version={COOKIES_VERSION}
      intro={t(m.cookies_intro)}
      sections={[
        { heading: t(m.cookies_ours_heading), list: t(m.cookies_ours_body) },
        { heading: t(m.cookies_security_heading), intro: t(m.cookies_security_body) },
        { heading: t(m.cookies_control_heading), intro: t(m.cookies_control_body) },
      ]}
    />
  );
}
