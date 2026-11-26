import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getLocale } from "@/app/_lib/i18n";
import { SiteFooter } from "@/components/site-footer";
import { m } from "@/paraglide/messages";
import "../globals.css";
import { instrumentSans, instrumentSerif } from "./fonts";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return {
    title: m.site_name({}, { locale }),
    description: m.landing_welcome({}, { locale }),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

/** Root layout for the public site: landing, registration, status check and voting. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={`${instrumentSerif.variable} ${instrumentSans.variable}`}
    >
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:rounded-md focus:bg-paper focus:p-3"
        >
          {m.skip_to_content({}, { locale })}
        </a>
        <div className="flex flex-1 flex-col">{children}</div>
        <SiteFooter locale={locale} />
      </body>
    </html>
  );
}
