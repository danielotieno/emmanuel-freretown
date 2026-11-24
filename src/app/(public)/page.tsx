import { getLocale } from "@/app/_lib/i18n";
import { LanguageSwitch } from "@/components/language-switch";
import { m } from "@/paraglide/messages";

/** Landing page. Placeholder until the church's content (services, programmes) is supplied. */
export default async function LandingPage() {
  const locale = await getLocale();
  return (
    <>
      <header className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <p className="font-display text-lg font-semibold text-brand">
          {m.site_name({}, { locale })}
        </p>
        <LanguageSwitch locale={locale} />
      </header>
      <main id="main" className="mx-auto max-w-content px-4 py-10 sm:px-6 md:py-16">
        <h1 className="max-w-[20ch] text-[clamp(2rem,6vw,3.5rem)]">
          {m.landing_welcome({}, { locale })}
        </h1>
        <p className="mt-6 max-w-[60ch] rounded-lg bg-cream p-5 text-ink">
          {m.landing_preparing({}, { locale })}
        </p>
      </main>
    </>
  );
}
