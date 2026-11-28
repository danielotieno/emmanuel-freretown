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
      {/* As on /registration: a white page beside the Black panel. */}
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-content px-4 pt-5 sm:px-6 sm:pt-8 lg:px-10">
          <StatusForm text={statusText(locale)} turnstileSiteKey={turnstileSiteKey(env)} />
        </div>
      </main>
    </>
  );
}
