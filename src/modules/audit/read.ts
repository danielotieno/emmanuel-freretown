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
   * In the full log, the values of an entry about a registration or member are left out: they
   * are personal data, shown only on that record's own trail, whose opening is recorded (D31).
   */
  withheld: boolean;
}

/** The records whose entries hold personal values, and that have a trail of their own. */
export type TrailEntityType = "registration" | "member";

/** The newest entries a trail shows. */
export const TRAIL_LIMIT = 100;

/** Entries a page of the full log shows. */
export const LOG_PAGE = 50;

/**
 * The audit trail of one registration or member (FR-11), newest first, for administrators.
 * Call it only after the record's own open function (`openRegistrationForReview`,
 * `openMember`), which records the access (D31): the trail shows the record's personal values.
 * `more` says older entries exist beyond `TRAIL_LIMIT`.
 */
export async function readTrail(
  db: DbOrTx,
  record: { entityType: TrailEntityType; entityId: string },
): Promise<{ entries: AuditRecord[]; more: boolean }> {
  if (!UUID.test(record.entityId)) return { entries: [], more: false };
  const rows = await select(
    db,
    and(eq(auditEntry.entityType, record.entityType), eq(auditEntry.entityId, record.entityId))!,
    TRAIL_LIMIT,
  );
  return {
    entries: rows.slice(0, TRAIL_LIMIT).map((r) => toRecord(r, false)),
    more: rows.length > TRAIL_LIMIT,
  };
}

/**
 * A page of the full audit log (FR-11), newest first, for Super Administrators only: the
 * caller checks the role (CLAUDE.md rule 1). `before` is the id of the oldest entry on the page
 * shown so far; `next` is the one to pass for the page after, or null on the last page. Values
 * of entries about a registration or member are withheld (see `AuditRecord.withheld`), so
 * reading the log is a list page and not recorded (D31).
 */
export async function readLog(
  db: DbOrTx,
  page: { before?: number } = {},
): Promise<{ entries: AuditRecord[]; next: number | null }> {
  const { before } = page;
  const rows = await select(
    db,
    before !== undefined && Number.isSafeInteger(before) ? lt(auditEntry.id, before) : undefined,
    LOG_PAGE,
  );
  const entries = rows.slice(0, LOG_PAGE).map((r) => toRecord(r, holdsPersonalValues(r)));
  return { entries, next: rows.length > LOG_PAGE ? entries.at(-1)!.id : null };
}

type Row = Awaited<ReturnType<typeof select>>[number];

/** One more row than the limit, to tell whether there are more. */
function select(db: DbOrTx, where: SQL | undefined, limit: number) {
  return safeQuery(() =>
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
      .where(where)
      .orderBy(desc(auditEntry.id))
      .limit(limit + 1),
  );
}

function holdsPersonalValues(row: Row): boolean {
  const record =
    (row.entityType === "registration" || row.entityType === "member") && row.entityId !== ALL;
  return record && (row.before !== null || row.after !== null);
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
