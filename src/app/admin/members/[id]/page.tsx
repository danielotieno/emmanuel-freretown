import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { ArrowIcon, CheckIcon, InfoIcon } from "@/components/icons";
import { staffNames } from "@/modules/access";
import { readTrail } from "@/modules/audit";
import { isClosedStatus, nextStatuses, openMember } from "@/modules/membership";
import { listActiveDepartments, listActiveHbcs, unitNames } from "@/modules/organisation";
import { AuditTrail, staffIdsIn } from "../../_components/audit-entries";
import { formatDateTime } from "../../review/format";
import { LANGUAGE_NAMES, STATUS_NAMES } from "../names";
import { MemberForms } from "./member-forms";

export const metadata: Metadata = { title: "Member · Staff" };

const DONE_MESSAGES: Record<string, string> = {
  details: "Details saved.",
  hbc: "Moved to the new HBC. The earlier HBC is kept in the history.",
  status: "Status changed.",
};

/**
 * One member record (FR-6, #22), for Membership Administrators and Super Administrators, with
 * its audit trail (FR-11, #24). Opening it is recorded as access to personal data (D31) by the
 * membership module, before anything is shown. A deceased or transferred-out member's record is
 * read-only. The forms only offer what the rules allow; the server actions check everything
 * again.
 */
export default async function MemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const { id } = await params;
  const db = await getDb();
  const record = await openMember(db, {
    memberId: id,
    actor: { type: "STAFF", userId: staff.userId },
    requestId: (await headers()).get("x-request-id") ?? undefined,
  });
  if (!record) notFound();
  const doneKey = (await searchParams).done;
  const done = typeof doneKey === "string" ? DONE_MESSAGES[doneKey] : undefined;

  const [units, hbcs, departments, trail] = await Promise.all([
    unitNames(db),
    listActiveHbcs(db),
    listActiveDepartments(db),
    readTrail(db, { entityType: "member", entityId: record.id }),
  ]);
  const names = { ...units, staff: await staffNames(db, staffIdsIn(trail.entries)) };
  const hbcName = (hbcId: string) => units.hbcs.get(hbcId) ?? "An HBC";
  const closed = isClosedStatus(record.status);
  // Departments the member already belongs to stay offered, even if deactivated since.
  const offered = [
    ...departments,
    ...record.departments
      .filter((d) => !departments.some((a) => a.id === d.departmentId))
      .map((d) => ({ id: d.departmentId, name: units.departments.get(d.departmentId) ?? "" })),
  ];

  return (
    <main className="min-h-dvh bg-cloud pb-16">
      <div className="mx-auto max-w-prose px-4 pt-4 sm:px-6 sm:pt-8">
        <Link
          href="/members"
          className="inline-flex min-h-11 items-center gap-2 text-small text-ink-muted hover:text-ink"
        >
          <ArrowIcon className="rotate-180" />
          Members
        </Link>
        <h1 className="mt-4 text-title">{record.fullName}</h1>
        <p className="mt-2 text-ink-muted">
          FWO <span className="tabular-nums">{record.fwoNumber}</span> ·{" "}
          {STATUS_NAMES[record.status]}
        </p>

        {done && (
          <p role="status" className="mt-6 flex gap-3 rounded-xl bg-mist p-4">
            <CheckIcon size="size-5" />
            <span>{done}</span>
          </p>
        )}
        {closed && (
          <p className="mt-6 flex gap-3 rounded-xl bg-mist p-4">
            <InfoIcon className="mt-1 text-brand" />
            <span>
              This record is closed: the member is {STATUS_NAMES[record.status].toLowerCase()}. It
              can be viewed but not changed, and their mobile number is free for another member
              (D20). Their details are removed one year after the change (D45).
            </span>
          </p>
        )}

        <section aria-labelledby="details-heading" className="mt-8">
          <h2 id="details-heading" className="text-subtitle">
            Record
          </h2>
          <dl className="in-card mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper text-card">
            <Row term="Full name">{record.fullName}</Row>
            <Row term="FWO number">
              <span className="tabular-nums">{record.fwoNumber}</span>
            </Row>
            <Row term="Mobile number">
              {record.phoneE164 ? (
                <span className="tabular-nums">{record.phoneE164}</span>
              ) : (
                "No personal phone"
              )}
            </Row>
            <Row term="SMS language">{LANGUAGE_NAMES[record.language]}</Row>
            <Row term="HBC">{hbcName(record.hbcId)}</Row>
            <Row term="Departments">
              {record.departments.length
                ? record.departments
                    .map(
                      (d) =>
                        `${units.departments.get(d.departmentId) ?? "A department"}${d.state === "DECLARED" ? " (declared)" : ""}`,
                    )
                    .join(", ")
                : "None"}
            </Row>
            <Row term="Status">
              {STATUS_NAMES[record.status]}
              {record.statusReason && (
                <span className="mt-1 block text-ink-muted">Reason: {record.statusReason}</span>
              )}
            </Row>
            <Row term="In the registry since">
              {formatDateTime(record.createdAt)}
              <span className="mt-1 block text-ink-muted">
                {record.importedAt
                  ? "Imported from the parish list (D47)"
                  : "Approved from a registration"}
              </span>
            </Row>
          </dl>
        </section>

        <section aria-labelledby="history-heading" className="mt-8">
          <h2 id="history-heading" className="text-subtitle">
            HBC history
          </h2>
          <ol className="in-card mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper text-card">
            {record.hbcHistory.map((p) => (
              <li
                key={p.validFrom.toISOString()}
                className="grid gap-1 px-5 py-3 sm:grid-cols-3 sm:gap-4"
              >
                <span>{hbcName(p.hbcId)}</span>
                <span className="text-ink-muted sm:col-span-2">
                  From {formatDateTime(p.validFrom)}
                  {p.validTo ? ` to ${formatDateTime(p.validTo)}` : " · current"}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {!closed && (
          <MemberForms
            memberId={record.id}
            version={record.version}
            current={{
              fullName: record.fullName,
              noPersonalPhone: record.phoneE164 === null,
              phone: record.phoneE164 ?? "",
              language: record.language,
              departmentIds: record.departments.map((d) => d.departmentId),
              hbcId: record.hbcId,
            }}
            statuses={nextStatuses(record.status).map((s) => ({ value: s, name: STATUS_NAMES[s] }))}
            hbcs={hbcs.filter((h) => h.id !== record.hbcId)}
            departments={offered}
          />
        )}

        <AuditTrail trail={trail} names={names} />
      </div>
    </main>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 px-5 py-3 sm:grid-cols-3 sm:gap-4">
      <dt className="text-ink-muted">{term}</dt>
      <dd className="sm:col-span-2">{children}</dd>
    </div>
  );
}
