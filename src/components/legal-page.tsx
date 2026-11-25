import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import type { Locale } from "@/i18n/locale";
import { m } from "@/paraglide/messages";

export interface LegalSection {
  heading: string;
  /** Paragraphs before the list. */
  intro?: string;
  /** A message whose lines become a bulleted list. */
  list?: string;
  /** Paragraphs after the list. */
  after?: string[];
}

/**
 * A plain, readable page for the privacy notice, terms and cookies (NFR-10, #27). Server-only
 * and static: no client JavaScript. The text is English only (D44); in Kiswahili a line points
 * to the church office for help.
 */
export function LegalPage(props: {
  locale: Locale;
  title: string;
  version: string;
  intro: string;
  sections: LegalSection[];
}) {
  const { locale } = props;
  // The text is English (D44): in any other language, say so and point to the church office.
  const englishOnly = locale === "en" ? undefined : m.legal_english_only({}, { locale });
  return (
    <>
      <SiteHeader locale={locale} />
      <main id="main" className="mx-auto max-w-prose px-4 pt-6 sm:px-6 sm:pt-12">
        <h1 className="text-[clamp(2.25rem,6vw,3.25rem)]">{props.title}</h1>
        <p className="mt-3 text-sm text-ink-muted tabular-nums">
          {m.legal_version({ version: props.version }, { locale })}
        </p>
        {englishOnly && <p className="mt-6 rounded-xl bg-lagoon p-4">{englishOnly}</p>}
        <div lang="en" className="mt-8 space-y-10">
          <p className="text-lg text-ink-muted">{props.intro}</p>
          {props.sections.map((section) => (
            <section key={section.heading} className="space-y-3">
              <h2 className="text-3xl">{section.heading}</h2>
              {section.intro && <p>{section.intro}</p>}
              {section.list && (
                <ul className="list-disc space-y-2 pl-6 marker:text-brand">
                  {section.list.split("\n").map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
              {section.after?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
        <p className="mt-14 border-t border-line pt-6">
          <Link href="/" prefetch={false}>
            <span aria-hidden="true">← </span>
            {m.legal_back_home({}, { locale })}
          </Link>
        </p>
      </main>
    </>
  );
}
