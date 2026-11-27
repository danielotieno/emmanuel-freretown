import { sql } from "drizzle-orm";
import { safeQuery, type DbOrTx, type Transaction } from "../../db";
import { SafeError } from "../observability";
import { assertNoSecrets, type AuditValues } from "./values";

/**
 * Who acted. Staff are identified by their staff user id. A member acting on a public page is
 * PUBLIC with no id: never a phone number, FWO number or name. SYSTEM is a scheduled job.
 */
export type Actor = StaffActor | { type: "PUBLIC" } | { type: "SYSTEM" };
export type StaffActor = { type: "STAFF"; userId: string };

/**
 * What an entry is about. Everything that belongs to a registration (its revisions,
 * verification evidence and decisions) is `registration`, with the registration's id, so that
 * retention redaction finds and redacts it (BR-14, `redact_expired_registration`). Add a type
 * here when a module first audits a new kind of record.
 */
export type AuditEntityType =
  "registration" | "member" | "member_import" | "fwo_setting" | "hbc" | "department" | "staff_user";

/**
 * One audit entry. The action is `<entity type>.<verb>` in snake_case, e.g.
 * `registration.approve`, and the type system ties its prefix to `entityType`.
 * `before` and `after` hold only the fields that changed (see `changes`), never a secret.
 * The time is set by the database; the application cannot choose it (FR-11).
 */
export type AuditEntry = {
  [E in AuditEntityType]: {
    actor: Actor;
    entityType: E;
    action: `${E}.${string}`;
    entityId: string;
    before?: AuditValues;
    after?: AuditValues;
    /** The request's `x-request-id`, to find its log lines. */
    requestId?: string;
  };
}[AuditEntityType];

const ACTION = /^([a-z][a-z0-9_]*)\.[a-z][a-z0-9_]*$/;

/**
 * Registrations, members, HBCs and departments have uuid ids, written in Postgres's lowercase
 * text form. Retention redaction finds a registration's entries by exact text match
 * (`entity_id = id::text`), so an entry filed under a reference or an uppercase uuid would keep
 * its personal values forever (BR-14). Staff user ids are Better Auth's text ids.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Appends an entry to the audit log inside the caller's transaction (CLAUDE.md rule 4, BR-12).
 * It takes a transaction, not a database, so the entry commits or rolls back with the state
 * change it records: if the change fails, no entry remains; if the entry fails, the change is
 * undone. Throws a SafeError, before touching the database, if the entry is malformed or holds
 * a secret; a database failure is thrown as a SafeDatabaseError.
 *
 *   await db.transaction(async (tx) => {
 *     // … the state change …
 *     await audit.write(tx, { actor, action: "registration.approve",
 *                             entityType: "registration", entityId: id });
 *   });
 */
export async function write(tx: Transaction, entry: AuditEntry): Promise<void> {
  await insert(tx, entry);
}

/**
 * Appends several entries in one statement, for a change that touches many records at once
 * (the import of the parish list, #104). Every entry is checked as `write` checks it, all before
 * the database is touched, so one malformed entry writes none.
 */
export async function writeMany(tx: Transaction, entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  for (const entry of entries) validate(entry);
  for (let start = 0; start < entries.length; start += WRITE_MANY_CHUNK) {
    const rows = entries.slice(start, start + WRITE_MANY_CHUNK).map(valuesOf);
    await safeQuery(() =>
      tx.execute(sql`
        INSERT INTO audit_entry
          (actor_type, actor_id, action, entity_type, entity_id, before, after, request_id)
        VALUES ${sql.join(rows, sql`, `)}`),
    );
  }
}

/** Eight parameters an entry: well under Postgres's 65,535 parameters a statement. */
const WRITE_MANY_CHUNK = 1000;

/** Collections (a search, an export) are about no one record; their entity id is this. */
const ALL = "*";

/**
 * Staff access to personal data (BR-12, D31): opening a registration or member record, running
 * a search (the number of results, never the search terms) and exporting. Viewing queue and
 * list pages is not recorded.
 */
export type AccessEvent = { actor: StaffActor; requestId?: string } & (
  | { kind: "view"; entityType: "registration" | "member"; entityId: string }
  | { kind: "search"; entityType: "registration" | "member"; results: number }
  | { kind: "export"; entityType: "registration" | "member"; rows: number }
);

/**
 * Records a staff member's access to personal data as `<entity type>.<kind>`. A read changes
 * nothing, so it needs no transaction; await this before returning the data, so that if the
 * entry cannot be written the data is not shown.
 */
export async function recordAccess(db: DbOrTx, event: AccessEvent): Promise<void> {
  const { actor, requestId, entityType, kind } = event;
  const target =
    event.kind === "view"
      ? { entityId: event.entityId }
      : event.kind === "search"
        ? { entityId: ALL, after: { results: count(event.results) } }
        : { entityId: ALL, after: { rows: count(event.rows) } };
  // TypeScript can't correlate `entityType` with the action built from it; insert checks it.
  const entry = { actor, requestId, entityType, action: `${entityType}.${kind}`, ...target };
  await insert(db, entry as AuditEntry, { collection: event.kind !== "view" });
}

function count(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new SafeError("invalid_audit_entry", "Audit counts must be non-negative integers");
  }
  return n;
}

async function insert(db: DbOrTx, entry: AuditEntry, { collection = false } = {}): Promise<void> {
  validate(entry, { collection });
  // Only the columns app_runtime may insert. Drizzle's insert() would list every column,
  // sending DEFAULT for the others, such as `at`, and the database refuses that (FR-11:
  // the application cannot choose an entry's time or mark it redacted).
  await safeQuery(() =>
    db.execute(sql`
      INSERT INTO audit_entry
        (actor_type, actor_id, action, entity_type, entity_id, before, after, request_id)
      VALUES ${valuesOf(entry)}`),
  );
}

/** One entry's values, in the column order of the inserts above. */
function valuesOf(entry: AuditEntry) {
  const { actor } = entry;
  const actorId = actor.type === "STAFF" ? actor.userId : null;
  const json = (values?: AuditValues) => (values ? JSON.stringify(values) : null);
  return sql`(${actor.type}, ${actorId}, ${entry.action}, ${entry.entityType}, ${entry.entityId},
              ${json(entry.before)}::jsonb, ${json(entry.after)}::jsonb, ${entry.requestId ?? null})`;
}

function validate(entry: AuditEntry, { collection = false } = {}): void {
  // The types already require all of this; these checks catch casts and untyped callers.
  const prefix = ACTION.exec(entry.action)?.[1];
  if (prefix !== entry.entityType) {
    throw new SafeError(
      "invalid_audit_entry",
      `Audit action must be "<entity type>.<verb>" with entity type ${entry.entityType}`,
    );
  }
  const validId = collection
    ? entry.entityId === ALL
    : entry.entityType === "staff_user"
      ? entry.entityId !== "" && entry.entityId !== ALL
      : UUID.test(entry.entityId);
  if (!validId) {
    throw new SafeError(
      "invalid_audit_entry",
      `Audit entity id must be the ${entry.entityType}'s id (a lowercase uuid, except staff users)`,
    );
  }
  assertNoSecrets(entry.before);
  assertNoSecrets(entry.after);
}
