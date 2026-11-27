import { and, desc, eq, lt, type SQL } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";
import { auditEntry } from "../../db/schema";
import type { AuditValues } from "./values";
import { ALL, UUID, type Actor } from "./write";

/** One audit entry, as staff read it (FR-11). Newest first wherever entries are listed. */
export interface AuditRecord {
  /** Entries are numbered in the order they were written. */
  id: number;
  at: Date;
  actor: Actor;
  action: string;
  entityType: string;
  /** The record's id, or `*` for a search or an export. */
  entityId: string;
  before: AuditValues | null;
  after: AuditValues | null;
  /** When retention removed the entry's values (BR-14, D45). */
  redactedAt: Date | null;
  /**
   * In the full log, the values of an entry that may hold personal data are left out: they are
   * shown only on that record's own trail, whose opening is recorded (D31).
   */
  withheld: boolean;
}

/** A page of entries, newest first. `next` is the `before` for the page after, or null. */
export interface AuditPage {
  entries: AuditRecord[];
  next: number | null;
}

/** The records with a trail of their own. */
export type TrailEntityType = "registration" | "member";

/** Entries a page shows, on a trail and in the full log. */
export const AUDIT_PAGE = 50;

/**
 * Entity types whose values the full log shows: they hold no member's details. Every other
 * type, including any added later, is withheld until it is reviewed and listed here.
 */
const VALUES_SHOWN_IN_LOG = new Set([
  "hbc",
  "department",
  "fwo_setting",
  "staff_user",
  "member_import",
]);

/**
 * A page of the audit trail of one registration or member (FR-11), newest first, with its
 * values, for administrators. Call it only after the record's own open function
 * (`openRegistrationForReview`, `openMember`), which records the access (D31): the trail shows
 * the record's personal values. `before` and `next` page as in `readLog`.
 */
export async function readTrail(
  db: DbOrTx,
  record: { entityType: TrailEntityType; entityId: string },
  page: { before?: number } = {},
): Promise<AuditPage> {
  if (!UUID.test(record.entityId)) return { entries: [], next: null };
  const about = and(
    eq(auditEntry.entityType, record.entityType),
    eq(auditEntry.entityId, record.entityId),
  );
  return readPage(db, about, page.before, () => false);
}

/**
 * A page of the full audit log (FR-11), newest first, for Super Administrators only: the
 * caller checks the role (CLAUDE.md rule 1). `before` is the id of the oldest entry on the page
 * shown so far. Values that may hold a member's details are withheld (see `AuditRecord.withheld`),
 * so reading the log is a list page and not recorded (D31).
 */
export async function readLog(db: DbOrTx, page: { before?: number } = {}): Promise<AuditPage> {
  return readPage(db, undefined, page.before, withheldFromLog);
}

async function readPage(
  db: DbOrTx,
  where: SQL | undefined,
  before: number | undefined,
  withhold: (row: Row) => boolean,
): Promise<AuditPage> {
  const older =
    before !== undefined && Number.isSafeInteger(before) ? lt(auditEntry.id, before) : undefined;
  // One more row than the page, to tell whether there is a page after it.
  const rows = await safeQuery(() =>
    db
      .select({
        id: auditEntry.id,
        at: auditEntry.at,
        actorType: auditEntry.actorType,
        actorId: auditEntry.actorId,
        action: auditEntry.action,
        entityType: auditEntry.entityType,
        entityId: auditEntry.entityId,
        before: auditEntry.before,
        after: auditEntry.after,
        redactedAt: auditEntry.redactedAt,
      })
      .from(auditEntry)
      .where(and(where, older))
      .orderBy(desc(auditEntry.id))
      .limit(AUDIT_PAGE + 1),
  );
  const entries = rows.slice(0, AUDIT_PAGE).map((r) => toRecord(r, withhold(r)));
  return { entries, next: rows.length > AUDIT_PAGE ? entries.at(-1)!.id : null };
}

type Row = {
  id: number;
  at: Date;
  actorType: "STAFF" | "PUBLIC" | "SYSTEM";
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  redactedAt: Date | null;
};

function withheldFromLog(row: Row): boolean {
  const hasValues = row.before !== null || row.after !== null;
  const shown = row.entityId === ALL || VALUES_SHOWN_IN_LOG.has(row.entityType);
  return hasValues && !shown;
}

function toRecord(row: Row, withheld: boolean): AuditRecord {
  const { actorType, actorId, before, after, ...rest } = row;
  const actor: Actor =
    actorType === "STAFF" ? { type: "STAFF", userId: actorId ?? "" } : { type: actorType };
  return {
    ...rest,
    actor,
    before: withheld ? null : (before as AuditValues | null),
    after: withheld ? null : (after as AuditValues | null),
    withheld,
  };
}
