import type { Metadata } from "next";
import { getEnv, turnstileSiteKey } from "@/app/_lib/env";
import { getLocale } from "@/app/_lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { m } from "@/paraglide/messages";
import { StatusForm } from "./status-form";
import { statusText } from "./text";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return { title: `${m.status_title({}, { locale })} · ${m.site_name({}, { locale })}` };
}

/**
 * Membership status check (FR-7, issue #20). Sent with `Cache-Control: no-store` by the
 * middleware: its answers are personal and must never be kept by a browser or a cache.
 */
export default async function StatusPage() {
  const locale = await getLocale();
  const env = await getEnv();
  return (
    <>
      <SiteHeader locale={locale} onStatusCheck />
      {/* As on /registration (#96): the page sits on Cloud down to the footer. */}
      <main id="main" className="mt-4 -mb-20 flex-1 bg-cloud pb-20 sm:mt-6 md:-mb-28 md:pb-28">
        <div className="mx-auto max-w-content px-4 pt-8 sm:px-6 sm:pt-12 lg:px-10">
          <StatusForm text={statusText(locale)} turnstileSiteKey={turnstileSiteKey(env)} />
        </div>
      </main>
    </>
  );
}
