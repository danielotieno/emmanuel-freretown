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
  // The body is English whatever the page language (D44); the title follows the visitor's.
  const en = { locale: "en" } as const;
  return (
    <LegalPage
      locale={locale}
      title={m.terms_title({}, { locale })}
      version={TERMS_VERSION}
      intro={m.terms_intro({}, en)}
      sections={[
        { heading: m.terms_register_heading({}, en), list: m.terms_register_body({}, en) },
        { heading: m.terms_use_heading({}, en), list: m.terms_use_body({}, en) },
        { heading: m.terms_availability_heading({}, en), intro: m.terms_availability_body({}, en) },
        { heading: m.terms_law_heading({}, en), intro: m.terms_law_body({}, en) },
      ]}
    />
  );
}
