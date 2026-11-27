import type { ReactNode } from "react";
import { ChevronIcon } from "@/components/icons";
import type { RevisionDetails } from "@/modules/registration";
import { formatDateTime } from "./format";

/**
 * A registration's revisions on staff screens (BR-09): the details each one recorded, who
 * submitted it and when. `open` shows them as they are; otherwise each is folded under a line
 * naming it, as earlier revisions are on the review and correction pages.
 */
export function RevisionList(props: {
  title: string;
  revisions: RevisionDetails[];
  units: { hbcs: Map<string, string>; departments: Map<string, string> };
  who: (userId: string | null) => string;
  open?: boolean;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-subtitle">{props.title}</h2>
      <div className="in-card mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper text-card">
        {props.revisions.map((r) => {
          const by = r.submittedByUserId ? props.who(r.submittedByUserId) : "the member";
          const line = `Revision ${r.revisionNo} · ${formatDateTime(r.submittedAt)} · by ${by}`;
          const rows = <Details revision={r} units={props.units} />;
          return props.open ? (
            <div key={r.revisionNo}>
              {rows}
              <p className="px-5 pb-4 text-small text-ink-muted">{line}</p>
            </div>
          ) : (
            <details key={r.revisionNo} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3">
                <span>{line}</span>
                <ChevronIcon className="shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-line">{rows}</div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function Details(props: {
  revision: RevisionDetails;
  units: { hbcs: Map<string, string>; departments: Map<string, string> };
}) {
  const r = props.revision;
  // Retention removes the details from every revision: of a rejected or withdrawn registration
  // after 12 months (BR-14), of a closed member's registration after a year (D45).
  if (r.fullName === null) {
    return (
      <p className="px-5 py-4 text-ink-muted">
        Details removed after the retention period (BR-14, D45).
      </p>
    );
  }
  return (
    <dl className="divide-y divide-line">
      <Row term="Full name">{r.fullName}</Row>
      <Row term="FWO number">
        {r.fwoNumber ? (
          <span className="tabular-nums">{r.fwoNumber}</span>
        ) : (
          "None yet (new member)"
        )}
      </Row>
      <Row term="Mobile number">
        {r.noPersonalPhone ? (
          "No personal phone"
        ) : (
          <span className="tabular-nums">{r.phoneE164}</span>
        )}
      </Row>
      <Row term="HBC">{r.hbcId ? props.units.hbcs.get(r.hbcId) : "Not known yet (D49)"}</Row>
      <Row term="Departments (declared)">
        {r.departmentIds.length
          ? r.departmentIds.map((d) => props.units.departments.get(d) ?? d).join(", ")
          : "None"}
      </Row>
      <Row term="Privacy notice">Version {r.privacyNoticeVersion}</Row>
    </dl>
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
