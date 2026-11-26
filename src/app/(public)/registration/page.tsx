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
      {/* The page sits on Cloud down to the footer, so the white question card stands out (#96):
          main fills the layout's column, and its negative margin meets the footer's top margin
          (mt-20, md:mt-28 in site-footer.tsx). */}
      <main id="main" className="mt-4 -mb-20 flex-1 bg-cloud pb-20 sm:mt-6 md:-mb-28 md:pb-28">
        <div className="mx-auto max-w-content px-4 pt-8 sm:px-6 sm:pt-12 lg:px-10">
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
