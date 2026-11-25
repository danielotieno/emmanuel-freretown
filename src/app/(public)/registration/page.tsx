import type { Metadata } from "next";
import { getDb } from "@/app/_lib/db";
import { getEnv, turnstileSiteKey } from "@/app/_lib/env";
import { getLocale } from "@/app/_lib/i18n";
import { SiteHeader } from "@/components/site-header";
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
      <SiteHeader locale={locale} />
      <main id="main" className="mx-auto max-w-form px-4 pt-6 sm:px-6 sm:pt-12">
        <h1 className="text-[clamp(2.25rem,6vw,3.25rem)]">{text.title}</h1>
        <p className="mt-3 mb-10 text-lg text-ink-muted">{text.intro}</p>
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
