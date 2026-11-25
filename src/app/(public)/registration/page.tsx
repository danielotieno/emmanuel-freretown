import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/app/_lib/db";
import { getEnv, turnstileSiteKey } from "@/app/_lib/env";
import { getLocale } from "@/app/_lib/i18n";
import { LanguageSwitch } from "@/components/language-switch";
import { listActiveDepartments, listActiveHbcs } from "@/modules/organisation";
import { m } from "@/paraglide/messages";
import { RegistrationForm } from "./registration-form";
import { registrationText } from "./text";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `${m.reg_title({}, { locale })} · ${m.site_name({}, { locale })}` };
}

/** Self-registration (FR-1, issue #16). */
export default async function RegistrationPage() {
  const locale = await getLocale();
  const db = await getDb();
  const [hbcs, departments, env] = await Promise.all([
    listActiveHbcs(db),
    listActiveDepartments(db),
    getEnv(),
  ]);
  const text = registrationText(locale);
  return (
    <>
      <header className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="font-display text-lg font-semibold text-brand no-underline">
          {m.site_name({}, { locale })}
        </Link>
        <LanguageSwitch locale={locale} />
      </header>
      <main id="main" className="mx-auto max-w-form px-4 pt-6 pb-16 sm:px-6">
        <h1 className="text-[clamp(1.75rem,5vw,2.5rem)]">{text.title}</h1>
        <p className="mt-3 mb-8 text-ink-muted">{text.intro}</p>
        <RegistrationForm
          text={text}
          hbcs={hbcs}
          departments={departments}
          turnstileSiteKey={turnstileSiteKey(env)}
        />
      </main>
    </>
  );
}
