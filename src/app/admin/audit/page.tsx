import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { ArrowIcon } from "@/components/icons";
import { staffNames } from "@/modules/access";
import { readLog } from "@/modules/audit";
import { unitNames } from "@/modules/organisation";
import { AuditEntries, staffIdsIn } from "../_components/audit-entries";

export const metadata: Metadata = { title: "Audit log · Staff" };

/**
 * The full audit log (FR-11, #24), for Super Administrators only, newest first, a page at a
 * time. Entries about a registration or member link to that record, whose page shows their
 * values and records the opening (D31); here they are withheld by the audit module, so viewing
 * the log is a list page and not recorded.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaff("SUPER_ADMIN");
  // An entry id, never personal data (rule 2).
  const param = (await searchParams).before;
  const before = typeof param === "string" && /^\d{1,15}$/.test(param) ? Number(param) : undefined;
  const db = await getDb();
  const [{ entries, next }, units] = await Promise.all([readLog(db, { before }), unitNames(db)]);
  const names = { ...units, staff: await staffNames(db, staffIdsIn(entries)) };

  return (
    <main className="min-h-dvh bg-cloud pb-16">
      <div className="mx-auto max-w-prose px-4 pt-4 sm:px-6 sm:pt-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 text-small text-ink-muted hover:text-ink"
        >
          <ArrowIcon className="rotate-180" />
          Staff home
        </Link>
        <h1 className="mt-4 text-title">Audit log</h1>
        <p className="mt-2 text-ink-muted">
          Every change and every access to personal data, newest first. Open a registration or
          member record to see the details of its entries.
        </p>

        <AuditEntries entries={entries} names={names} showRecord />

        {(before !== undefined || next !== null) && (
          <nav aria-label="Pages" className="mt-6 flex gap-3">
            {before !== undefined && (
              <Link href="/audit" className="btn-text">
                Newest
              </Link>
            )}
            {next !== null && (
              <Link href={`/audit?before=${next}`} className="btn-secondary">
                Older entries
              </Link>
            )}
          </nav>
        )}
      </div>
    </main>
  );
}
