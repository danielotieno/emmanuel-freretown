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
  const t = (message: (inputs: object, options: { locale: "en" }) => string) =>
    message({}, { locale: "en" });
  return (
    <LegalPage
      locale={locale}
      title={m.privacy_title({}, { locale })}
      version={PRIVACY_NOTICE_VERSION}
      intro={t(m.privacy_intro)}
      sections={[
        {
          heading: t(m.privacy_collect_heading),
          list: t(m.privacy_collect_body),
          after: [t(m.privacy_collect_not), t(m.privacy_collect_visits)],
        },
        {
          heading: t(m.privacy_why_heading),
          list: t(m.privacy_why_body),
          after: [t(m.privacy_why_sensitive)],
        },
        { heading: t(m.privacy_where_heading), intro: t(m.privacy_where_body) },
        { heading: t(m.privacy_who_heading), intro: t(m.privacy_who_body) },
        {
          heading: t(m.privacy_processors_heading),
          intro: t(m.privacy_processors_intro),
          list: t(m.privacy_processors_body),
        },
        { heading: t(m.privacy_keep_heading), list: t(m.privacy_keep_body) },
        { heading: t(m.privacy_safe_heading), intro: t(m.privacy_safe_body) },
        {
          heading: t(m.privacy_rights_heading),
          list: t(m.privacy_rights_body),
          after: [t(m.privacy_rights_how)],
        },
        { heading: t(m.privacy_contact_heading), intro: t(m.privacy_contact_body) },
        { heading: t(m.privacy_changes_heading), intro: t(m.privacy_changes_body) },
      ]}
    />
  );
}
