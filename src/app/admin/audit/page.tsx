import type { Metadata } from "next";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { staffNames } from "@/modules/access";
import { readLog } from "@/modules/audit";
import { unitNames } from "@/modules/organisation";
import { AuditEntries, AuditPager, pageBefore, staffIdsIn } from "../_components/audit-entries";
import { StaffShell } from "../_components/staff-shell";

export const metadata: Metadata = { title: "Audit log · Staff" };

/**
 * The full audit log (FR-11, #24), for Super Administrators only, newest first, a page at a
 * time. Entries about a registration or member link to that record, whose page shows their
 * values and records the opening (D31); here values that may hold a member's details are
 * withheld by the audit module, so viewing the log is a list page and not recorded.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff("SUPER_ADMIN");
  const before = pageBefore((await searchParams).before);
  const db = await getDb();
  const [{ entries, next }, units] = await Promise.all([readLog(db, { before }), unitNames(db)]);
  const names = { ...units, staff: await staffNames(db, staffIdsIn(entries)) };

  return (
    <StaffShell staff={staff} current="audit" width="prose">
      <h1 className="text-title">Audit log</h1>
      <p className="mt-2 text-ink-muted">
        Every change and every access to personal data, newest first. Open a registration or member
        record to see the details of its entries.
      </p>

      <AuditEntries entries={entries} names={names} showRecord />

      <AuditPager
        before={before}
        next={next}
        href={(id) => (id === undefined ? "/audit" : `/audit?before=${id}`)}
      />
    </StaffShell>
  );
}
