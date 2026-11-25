import Link from "next/link";
import { LanguageSwitch } from "@/components/language-switch";
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
      <header className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="font-display text-lg font-semibold text-brand no-underline">
          {m.site_name({}, { locale })}
        </Link>
        <LanguageSwitch locale={locale} />
      </header>
      <main id="main" className="mx-auto max-w-[44rem] px-4 pt-6 pb-16 sm:px-6">
        <h1 className="text-[clamp(1.75rem,5vw,2.5rem)]">{props.title}</h1>
        <p className="mt-2 text-ink-muted tabular-nums">
          {m.legal_version({ version: props.version }, { locale })}
        </p>
        {englishOnly && <p className="mt-4 rounded-md bg-cream p-4">{englishOnly}</p>}
        <div lang="en" className="mt-6 space-y-8">
          <p>{props.intro}</p>
          {props.sections.map((section) => (
            <section key={section.heading} className="space-y-3">
              <h2 className="text-2xl">{section.heading}</h2>
              {section.intro && <p>{section.intro}</p>}
              {section.list && (
                <ul className="list-disc space-y-2 pl-6">
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
        <p className="mt-12">
          <Link href="/">{m.legal_back_home({}, { locale })}</Link>
        </p>
      </main>
    </>
  );
}
