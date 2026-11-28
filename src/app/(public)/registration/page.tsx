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
      <SiteHeader locale={locale} onRegistration />
      {/* White like every page (DESIGN.md §2): the Black panel and the size of the question do the
          work a tinted ground used to. */}
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-content px-4 pt-5 sm:px-6 sm:pt-8 lg:px-10">
          <RegistrationForm
            text={text}
            hbcs={hbcs}
            departments={departments}
            turnstileSiteKey={turnstileSiteKey(env)}
          />
        </div>
      </main>
    </>
  );
}
