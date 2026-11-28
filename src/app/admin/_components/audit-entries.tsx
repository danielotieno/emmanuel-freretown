import Link from "next/link";
import type { ReactNode } from "react";
import type { AuditPage, AuditRecord, AuditValue } from "@/modules/audit";
import { LANGUAGE_NAMES } from "../members/names";
import { formatDateTime } from "../review/format";

/** The names an entry list shows in place of ids. */
export interface AuditNames {
  staff: Map<string, string>;
  hbcs: Map<string, string>;
  departments: Map<string, string>;
}

/** Every staff user the entries name: who acted, and whom a staff entry is about. */
export function staffIdsIn(entries: AuditRecord[]): string[] {
  return entries.flatMap((e) => [
    ...(e.actor.type === "STAFF" ? [e.actor.userId] : []),
    ...(e.entityType === "staff_user" ? [e.entityId] : []),
  ]);
}

/** What happened, in words. An action not listed here shows as written. */
const ACTION_NAMES: Record<string, string> = {
  "registration.submit": "Submitted",
  "registration.verify_phone": "Phone checked by code",
  "registration.verify_in_person": "Met in person by an officer",
  "registration.issue_fwo": "FWO number issued",
  "registration.approve": "Approved",
  "registration.reject": "Rejected",
  "registration.request_correction": "Correction requested",
  "registration.correct": "Corrected by staff",
  "registration.flag_conflict": "Conflict flagged",
  "registration.view": "Opened",
  "registration.redact": "Personal details removed",
  "member.create": "Added to the registry",
  "member.view": "Opened",
  "member.search": "Searched",
  "member.export": "Exported",
  "member.edit": "Details changed",
  "member.transfer_hbc": "Moved to another HBC",
  "member.change_status": "Status changed",
  "member.redact": "Personal details removed",
  "member_import.create": "Parish list imported",
  "hbc.create": "HBC added",
  "hbc.rename": "HBC renamed",
  "hbc.reorder": "HBC moved in the list",
  "hbc.deactivate": "HBC deactivated",
  "hbc.activate": "HBC reactivated",
  "department.create": "Department added",
  "department.rename": "Department renamed",
  "department.reorder": "Department moved in the list",
  "department.deactivate": "Department deactivated",
  "department.activate": "Department reactivated",
  "fwo_setting.update": "Highest FWO number recorded",
  "staff_user.create": "Staff account created",
  "staff_user.grant_role": "Role granted",
  "staff_user.enable_second_factor": "Authenticator app set up",
  "staff_user.use_backup_code": "Backup code used",
  "staff_user.revoke_role": "Role revoked",
  "staff_user.reset_second_factor": "Authenticator app reset",
  "staff_user.reset_password": "Temporary password issued",
  "staff_user.change_password": "Password changed",
  "staff_user.revoke_sessions": "Signed out everywhere",
};

/** Value names where splitting the key into words isn't enough. */
const KEY_NAMES: Record<string, string> = {
  fwoNumber: "FWO number",
  phone: "Mobile number",
  phoneE164: "Mobile number",
  language: "SMS language",
  hbcId: "HBC",
  departmentIds: "Departments",
  fwoConflict: "FWO conflict",
  revisionNo: "Revision",
  memberId: "Member",
  sourceRegistrationId: "Registration",
  importId: "Imported from",
  consentToNotice: "Agreed to privacy notice",
  sortOrder: "Position",
  isActive: "Active",
};

/**
 * The page of entries asked for in the URL: the id of the oldest entry on the page before it,
 * never personal data (rule 2). Anything else is the newest page.
 */
export function pageBefore(param: string | string[] | undefined): number | undefined {
  return typeof param === "string" && /^\d{1,15}$/.test(param) ? Number(param) : undefined;
}

/**
 * A registration's or member's audit trail (FR-11), a page at a time at the foot of its page,
 * which it reaches as `path?trail=<id>`: shown only after the page has opened the record, which
 * records the access (D31). Every page load is an opening, so the trail grows as it is read.
 */
export function AuditTrail({
  trail,
  names,
  path,
  before,
}: {
  trail: AuditPage;
  names: AuditNames;
  path: string;
  before?: number;
}) {
  return (
    <section aria-labelledby="audit-heading" className="mt-8">
      <h2 id="audit-heading" className="text-subtitle">
        Audit trail
      </h2>
      <p className="mt-2 text-small text-ink-muted">
        Every change to this record and every time staff opened it, newest first.
      </p>
      <AuditEntries entries={trail.entries} names={names} />
      <AuditPager
        before={before}
        next={trail.next}
        href={(id) => `${path}${id === undefined ? "" : `?trail=${id}`}#audit-heading`}
      />
    </section>
  );
}

/** Links to the newest page and to the page after this one, where there are any. */
export function AuditPager({
  before,
  next,
  href,
}: {
  before?: number;
  next: number | null;
  href: (before?: number) => string;
}) {
  if (before === undefined && next === null) return null;
  return (
    <nav aria-label="Pages" className="mt-6 flex gap-3">
      {before !== undefined && (
        <Link href={href()} className="btn-text">
          Newest
        </Link>
      )}
      {next !== null && (
        <Link href={href(next)} className="btn-secondary">
          Older entries
        </Link>
      )}
    </nav>
  );
}

/** Values that are codes, not text someone typed. */
const CODE_KEYS = new Set(["status", "channel", "evidence", "verification", "cause", "method"]);

/**
 * Audit entries, newest first (FR-11). On a record's own trail they show their values; in the
 * full log (`showRecord`) each names the record it is about, and values that may hold a member's
 * details are withheld by the audit module, shown on that record instead.
 */
export function AuditEntries({
  entries,
  names,
  showRecord = false,
}: {
  entries: AuditRecord[];
  names: AuditNames;
  showRecord?: boolean;
}) {
  if (entries.length === 0) {
    return <p className="mt-3 text-ink-muted">No entries.</p>;
  }
  return (
    <ol className="in-card mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper text-card">
      {entries.map((e) => (
        <li key={e.id} className="px-5 py-4">
          <p>
            {ACTION_NAMES[e.action] ?? e.action}
            {showRecord && <span className="text-ink-muted"> · {recordOf(e, names)}</span>}
          </p>
          <p className="text-small text-ink-muted">
            {actorOf(e, names)} · {formatDateTime(e.at)}
          </p>
          <Values entry={e} names={names} />
        </li>
      ))}
    </ol>
  );
}

function actorOf({ actor }: AuditRecord, names: AuditNames): string {
  if (actor.type === "STAFF") return names.staff.get(actor.userId) ?? "A staff member";
  return actor.type === "PUBLIC" ? "On the public site" : "Scheduled job";
}

function recordOf(e: AuditRecord, names: AuditNames): ReactNode {
  if (e.entityId === "*") return e.entityType === "member" ? "All members" : "All registrations";
  switch (e.entityType) {
    case "registration":
      return <RecordLink href={`/review/${e.entityId}`}>Registration</RecordLink>;
    case "member":
      return <RecordLink href={`/members/${e.entityId}`}>Member record</RecordLink>;
    case "staff_user":
      return (
        <RecordLink href={`/staff/${encodeURIComponent(e.entityId)}`}>
          {`Staff: ${names.staff.get(e.entityId) ?? "a staff member"}`}
        </RecordLink>
      );
    case "hbc":
      return `HBC: ${names.hbcs.get(e.entityId) ?? "an HBC"}`;
    case "department":
      return `Department: ${names.departments.get(e.entityId) ?? "a department"}`;
    case "member_import":
      return "Parish list import";
    case "fwo_setting":
      return "FWO numbers";
    default:
      return e.entityType;
  }
}

/**
 * An entry's values. Retention may have removed some (D45 keeps the reasons and statuses) or all
 * of them (BR-14); what is left still shows, after a note of when.
 */
function Values({ entry, names }: { entry: AuditRecord; names: AuditNames }) {
  const removed = entry.redactedAt && (
    <p className="mt-1 text-small text-ink-muted">
      Personal details removed {formatDateTime(entry.redactedAt)} under the retention rules.
    </p>
  );
  if (entry.withheld) {
    return (
      <>
        {removed}
        <p className="mt-1 text-small text-ink-muted">Details on the record.</p>
      </>
    );
  }
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return (
    <>
      {removed}
      {keys.length > 0 && (
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-small sm:grid-cols-3">
          {keys.map((key) => (
            <div key={key} className="contents">
              <dt className="text-ink-muted">{labelOf(key)}</dt>
              <dd className="sm:col-span-2">
                {key in before && (
                  <>
                    {valueOf(key, before[key]!, names)} <span aria-hidden="true">→</span>
                    <span className="sr-only">changed to</span>{" "}
                  </>
                )}
                {key in after ? valueOf(key, after[key]!, names) : "None"}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

function labelOf(key: string): string {
  return KEY_NAMES[key] ?? sentence(key.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
}

function valueOf(key: string, value: AuditValue, names: AuditNames): ReactNode {
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "None";
    if (key === "departmentIds") {
      return value.map((id) => names.departments.get(String(id)) ?? "A department").join(", ");
    }
    if (key === "changed") return value.map((k) => labelOf(String(k))).join(", ");
    return value.map(String).join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  switch (key) {
    case "hbcId":
      return names.hbcs.get(value) ?? "An HBC";
    case "language":
      return LANGUAGE_NAMES[value as keyof typeof LANGUAGE_NAMES] ?? value;
    case "memberId":
      return <RecordLink href={`/members/${value}`}>Member record</RecordLink>;
    case "importId":
      return "The parish list (D47)";
    case "sourceRegistrationId":
      return <RecordLink href={`/review/${value}`}>Registration</RecordLink>;
    default:
      // Codes such as TRANSFERRED_OUT or member_import read as words; names and reasons as typed.
      return CODE_KEYS.has(key) ? sentence(value.replace(/_/g, " ")) : value;
  }
}

function sentence(words: string): string {
  const lower = words.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function RecordLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="underline underline-offset-2 hover:text-ink">
      {children}
    </Link>
  );
}
