import type { Metadata } from "next";
import { getLocale } from "@/app/_lib/i18n";
import { LegalPage } from "@/components/legal-page";
import { m } from "@/paraglide/messages";
import { TERMS_VERSION } from "../legal-versions";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `${m.terms_title({}, { locale })} · ${m.site_name({}, { locale })}` };
}

/** Terms of use (#27). */
export default async function TermsPage() {
  const locale = await getLocale();
  const t = (message: (inputs: object, options: { locale: "en" }) => string) =>
    message({}, { locale: "en" });
  return (
    <LegalPage
      locale={locale}
      title={m.terms_title({}, { locale })}
      version={TERMS_VERSION}
      intro={t(m.terms_intro)}
      sections={[
        { heading: t(m.terms_register_heading), list: t(m.terms_register_body) },
        { heading: t(m.terms_use_heading), list: t(m.terms_use_body) },
        { heading: t(m.terms_availability_heading), intro: t(m.terms_availability_body) },
        { heading: t(m.terms_law_heading), intro: t(m.terms_law_body) },
      ]}
    />
  );
}
