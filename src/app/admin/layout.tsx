import type { Metadata } from "next";
import type { ReactNode } from "react";
import { m } from "@/paraglide/messages";
import { instrumentSans, instrumentSerif } from "../(public)/fonts";
import "./staff.css";

// Staff pages always depend on the session, and the CSP nonce needs per-request rendering.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // The staff area is English.
  title: `Staff · ${m.site_name({}, { locale: "en" })}`,
  robots: { index: false, follow: false },
};

/**
 * Root layout for the staff portal, served on the admin hostnames (see src/middleware.ts).
 * Admin screens may be English-only in Release 1, but the officer desk (assisted registration)
 * must be available in English and Kiswahili (NFR-5): desk routes set their own locale.
 * It loads the site's two faces (DESIGN.md §3); `staff` sets the portal's denser type (globals.css).
 * Every admin page and server action must check the staff session and role itself:
 * this layout and the proxy are not a security boundary (CLAUDE.md rule 1).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`site staff ${instrumentSans.variable} ${instrumentSerif.variable}`}
    >
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
