import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getDb } from "@/app/_lib/db";
import { getEnv, turnstileSiteKey } from "@/app/_lib/env";
import { getLocale } from "@/app/_lib/i18n";
import { requireStaff } from "@/app/_lib/staff";
import { LanguageSwitch } from "@/components/language-switch";
import { publicOrigin } from "@/lib/hosts";
import { listActiveDepartments, listActiveHbcs } from "@/modules/organisation";
import { DeskForm } from "./desk-form";
import { deskText } from "./text";

export const metadata: Metadata = { title: "Registration desk · Staff" };

/**
 * The officer desk (FR-3, #18): a Registration Officer registers a member on their behalf, on
 * a phone at an AGM or in the church office. Registration Officers only; the server actions
 * check again (CLAUDE.md rule 1). In English or Kiswahili (NFR-5), with the language switch.
 */
export default async function DeskPage() {
  const staff = await requireStaff("REGISTRATION_OFFICER");
  const locale = await getLocale();
  const db = await getDb();
  const [hbcs, departments, env, requestHeaders] = await Promise.all([
    listActiveHbcs(db),
    listActiveDepartments(db),
    getEnv(),
    headers(),
  ]);
  const text = deskText(locale);
  const privacyUrl = `${publicOrigin(requestHeaders.get("host")) ?? ""}/privacy`;
  return (
    <main id="main" lang={locale} className="min-h-dvh bg-cloud pb-16">
      <div className="mx-auto max-w-form px-4 pt-4 sm:px-6 sm:pt-8">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center text-small text-ink-muted hover:text-ink"
          >
            {text.home}
          </Link>
          <LanguageSwitch locale={locale} />
        </div>
        <h1 className="mt-6 text-title">{text.title}</h1>
        <p className="mt-3 text-ink-muted">{text.intro}</p>
        <div className="mt-6">
          <DeskForm
            text={text}
            officerId={staff.userId}
            hbcs={hbcs}
            departments={departments}
            turnstileSiteKey={turnstileSiteKey(env)}
            privacyUrl={privacyUrl}
          />
        </div>
      </div>
    </main>
  );
}
