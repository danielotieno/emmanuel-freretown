import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getLocale } from "@/app/_lib/i18n";
import { m } from "@/paraglide/messages";
import "../globals.css";

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
  themeColor: "#fffef9",
};

/** Root layout for the public site: landing, registration, status check and voting. */
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:rounded-md focus:bg-paper focus:p-3"
        >
          {m.skip_to_content({}, { locale })}
        </a>
        {children}
      </body>
    </html>
  );
}
