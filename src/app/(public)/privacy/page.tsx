import type { Metadata } from "next";
import { getLocale } from "@/app/_lib/i18n";
import { LegalPage } from "@/components/legal-page";
import { PRIVACY_NOTICE_VERSION } from "@/modules/registration";
import { m } from "@/paraglide/messages";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `${m.privacy_title({}, { locale })} · ${m.site_name({}, { locale })}` };
}

/** The privacy notice (NFR-10, BR-15, #27). Registrations record its version. */
export default async function PrivacyPage() {
  const locale = await getLocale();
  // The body is English whatever the page language (D44); the title follows the visitor's.
  const en = { locale: "en" } as const;
  return (
    <LegalPage
      locale={locale}
      title={m.privacy_title({}, { locale })}
      version={PRIVACY_NOTICE_VERSION}
      intro={m.privacy_intro({}, en)}
      sections={[
        {
          heading: m.privacy_collect_heading({}, en),
          list: m.privacy_collect_body({}, en),
          after: [
            m.privacy_collect_not({}, en),
            m.privacy_collect_source({}, en),
            m.privacy_collect_visits({}, en),
          ],
        },
        {
          heading: m.privacy_why_heading({}, en),
          list: m.privacy_why_body({}, en),
          after: [m.privacy_why_sensitive({}, en)],
        },
        { heading: m.privacy_where_heading({}, en), intro: m.privacy_where_body({}, en) },
        { heading: m.privacy_who_heading({}, en), intro: m.privacy_who_body({}, en) },
        {
          heading: m.privacy_processors_heading({}, en),
          intro: m.privacy_processors_intro({}, en),
          list: m.privacy_processors_body({}, en),
        },
        { heading: m.privacy_keep_heading({}, en), list: m.privacy_keep_body({}, en) },
        { heading: m.privacy_safe_heading({}, en), intro: m.privacy_safe_body({}, en) },
        {
          heading: m.privacy_rights_heading({}, en),
          list: m.privacy_rights_body({}, en),
          after: [m.privacy_rights_how({}, en)],
        },
        { heading: m.privacy_contact_heading({}, en), intro: m.privacy_contact_body({}, en) },
        { heading: m.privacy_changes_heading({}, en), intro: m.privacy_changes_body({}, en) },
      ]}
    />
  );
}
