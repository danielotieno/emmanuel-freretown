import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { isUniqueViolation, safeQuery, type DbOrTx, type Transaction } from "../../db";
import {
  departmentMembership,
  hbc,
  member,
  memberHbcAssignment,
  memberImport,
} from "../../db/schema";
import * as audit from "../audit";
import { checkUnitsForRegistration } from "../organisation";
import { normalizeKenyanPhone } from "../verification";

/**
 * Member records (FR-6, #22): administrators find, open and maintain the official record. Every
 * change needs a reason and writes an audit entry in its transaction (BR-12, rule 4); opening a
 * record and searching are recorded as access to personal data, the list is not (D31). Callers
 * check for a Membership Administrator first (CLAUDE.md rule 1); these functions enforce
 * everything about the record itself.
 *
 * A member marked deceased or transferred out is closed: their record can be opened but not
 * changed (#22), and their phone number is released for another member (D20, `member_phone_uq`
 * covers active and inactive members only). The FWO number never changes (D2).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// A control character (a NUL byte, say) would make the database refuse the statement.
const CONTROL = /[\u0000-\u001f\u007f]/;

export const MEMBER_STATUSES = ["ACTIVE", "INACTIVE", "DECEASED", "TRANSFERRED_OUT"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

/**
 * The member lifecycle (domain-model.md §3): `ACTIVE ⇄ INACTIVE`, and either of them to
 * `DECEASED` or `TRANSFERRED_OUT`, which are final.
 */
const NEXT_STATUSES: Record<MemberStatus, readonly MemberStatus[]> = {
  ACTIVE: ["INACTIVE", "DECEASED", "TRANSFERRED_OUT"],
  INACTIVE: ["ACTIVE", "DECEASED", "TRANSFERRED_OUT"],
  DECEASED: [],
  TRANSFERRED_OUT: [],
};

/** The statuses a member in `status` may be moved to; none once the record is closed. */
export function nextStatuses(status: MemberStatus): readonly MemberStatus[] {
  return NEXT_STATUSES[status];
}

/** Deceased and transferred-out members' records can't be changed (#22). */
export function isClosedStatus(status: MemberStatus): boolean {
  return NEXT_STATUSES[status].length === 0;
}

// ---------------------------------------------------------------- field checks (pure)

export type MemberFieldError = "required" | "too_short" | "too_long" | "invalid";
type Checked<T> = { ok: true; value: T } | { ok: false; error: MemberFieldError };

/** The database CHECK's rule: 2–120 characters, counted as Postgres counts them (code points). */
function checkName(input: string): Checked<string> {
  const value = input.trim().replace(/\s+/g, " ");
  const length = [...value].length;
  if (!value) return { ok: false, error: "required" };
  if (CONTROL.test(value)) return { ok: false, error: "invalid" };
  if (length < 2) return { ok: false, error: "too_short" };
  if (length > 120) return { ok: false, error: "too_long" };
  return { ok: true, value };
}

/**
 * Why a record was changed (FR-6): required, 3–500 characters, as for review decisions. Status
 * reasons are kept after D45 removes the member's details, so staff are asked not to write
 * names or numbers in them.
 */
export function checkMemberReason(input: string): Checked<string> {
  const value = input.trim();
  if (!value) return { ok: false, error: "required" };
  if (CONTROL.test(value.replace(/[\r\n\t]/g, " "))) return { ok: false, error: "invalid" };
  if ([...value].length < 3) return { ok: false, error: "too_short" };
  if ([...value].length > 500) return { ok: false, error: "too_long" };
  return { ok: true, value };
}

/** What an administrator may edit (FR-6). Not the FWO number (D2), status or HBC. */
export interface MemberDetailsFields {
  fullName: string;
  /** BR-06: the member has no phone of their own; the phone field is then ignored. */
  noPersonalPhone: boolean;
  phone: string;
  /** The SMS language, `en` or `sw` (D44). */
  language: string;
  departmentIds: string[];
}

export interface MemberDetails {
  fullName: string;
  /** Null: no personal phone. */
  phoneE164: string | null;
  language: "en" | "sw";
  departmentIds: string[];
}

export type MemberDetailsFieldName = "fullName" | "phone" | "language";

/** Checks the edited details; the errors are keyed by field. */
export function checkMemberDetails(
  fields: MemberDetailsFields,
):
  | { ok: true; value: MemberDetails }
  | { ok: false; errors: Partial<Record<MemberDetailsFieldName, MemberFieldError>> } {
  const errors: Partial<Record<MemberDetailsFieldName, MemberFieldError>> = {};
  const name = checkName(fields.fullName);
  if (!name.ok) errors.fullName = name.error;
  let phoneE164: string | null = null;
  if (!fields.noPersonalPhone) {
    if (!fields.phone.trim()) errors.phone = "required";
    else {
      phoneE164 = normalizeKenyanPhone(fields.phone);
      if (!phoneE164) errors.phone = "invalid";
    }
  }
  const language = fields.language === "en" || fields.language === "sw" ? fields.language : null;
  if (!language) errors.language = "required";
  if (!name.ok || !language || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      fullName: name.value,
      phoneE164,
      language,
      departmentIds: [...new Set(fields.departmentIds.map((d) => d.trim()).filter(Boolean))],
    },
  };
}

// ---------------------------------------------------------------- list, search, open

export interface MemberListItem {
  id: string;
  fwoNumber: string;
  /** Null once D45's removal has run. */
  fullName: string | null;
  status: MemberStatus;
  hbcName: string;
}

export interface MemberListFilters {
  hbcId?: string;
  status?: MemberStatus;
}

const listColumns = {
  id: member.id,
  fwoNumber: member.fwoNumber,
  fullName: member.fullName,
  status: member.status,
  hbcName: hbc.name,
};

/** The member's one open HBC period (BR-04). */
const openPeriod = and(
  eq(memberHbcAssignment.memberId, member.id),
  isNull(memberHbcAssignment.validTo),
);

/**
 * Members by name, filtered by HBC and status, at most `limit` of them, with the total. A list
 * page: viewing it is not recorded (D31). Filters are ids and statuses, never personal data, so
 * the page may keep them in its URL.
 */
export async function listMembers(
  db: DbOrTx,
  filters: MemberListFilters = {},
  limit = 200,
): Promise<{ items: MemberListItem[]; total: number }> {
  const conditions: SQL[] = [];
  if (filters.hbcId !== undefined) {
    // Not a well-formed id: no HBC, so no members (never a database error).
    if (!UUID.test(filters.hbcId)) return { items: [], total: 0 };
    conditions.push(eq(memberHbcAssignment.hbcId, filters.hbcId));
  }
  if (filters.status) conditions.push(eq(member.status, filters.status));
  const where = conditions.length ? and(...conditions) : undefined;
  const [items, [totals]] = await Promise.all([
    safeQuery(() =>
      db
        .select(listColumns)
        .from(member)
        .innerJoin(memberHbcAssignment, openPeriod)
        .innerJoin(hbc, eq(hbc.id, memberHbcAssignment.hbcId))
        .where(where)
        .orderBy(asc(member.fullName), asc(member.id))
        .limit(limit),
    ),
    safeQuery(() =>
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(member)
        .innerJoin(memberHbcAssignment, openPeriod)
        .where(where),
    ),
  ]);
  return { items, total: totals?.n ?? 0 };
}

export const SEARCH_LIMIT = 50;

export type MemberSearchResult =
  | { ok: true; items: MemberListItem[]; total: number }
  /** Too short to search for (under 2 characters) or too long (over 120): nothing was run. */
  | { ok: false; reason: "too_short" | "too_long" };

/**
 * Finds members, in any status, by FWO number (exactly as written, D29), phone number (any
 * Kenyan form, matched in E.164) or part of the name (ignoring case). Records `member.search`
 * with the number of results, never the terms (D31), before returning anything. The terms must
 * never reach a URL or a log (rule 2): the page posts them.
 */
export async function searchMembers(
  db: DbOrTx,
  search: { query: string; actor: audit.StaffActor; requestId?: string },
): Promise<MemberSearchResult> {
  const query = search.query.trim().replace(/\s+/g, " ");
  // An FWO number can be a single digit (BR-01 has no length rule), so digits are never too short.
  const digitsOnly = /^[0-9]+$/.test(query);
  if ([...query].length < (digitsOnly ? 1 : 2)) return { ok: false, reason: "too_short" };
  if ([...query].length > 120) return { ok: false, reason: "too_long" };

  const matches: SQL[] = [];
  if (/^[0-9]+$/.test(query)) matches.push(eq(member.fwoNumber, query));
  const phone = /^[0-9+\s-]+$/.test(query) ? normalizeKenyanPhone(query) : null;
  if (phone) matches.push(eq(member.phoneE164, phone));
  if (/\p{L}/u.test(query)) {
    const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`);
    matches.push(ilike(member.fullName, `%${escaped}%`));
  }
  const where = matches.length ? or(...matches) : sql`false`;

  const [items, [totals]] = await Promise.all([
    safeQuery(() =>
      db
        .select(listColumns)
        .from(member)
        .innerJoin(memberHbcAssignment, openPeriod)
        .innerJoin(hbc, eq(hbc.id, memberHbcAssignment.hbcId))
        .where(where)
        .orderBy(asc(member.fullName), asc(member.id))
        .limit(SEARCH_LIMIT),
    ),
    safeQuery(() =>
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(member)
        .innerJoin(memberHbcAssignment, openPeriod)
        .where(where),
    ),
  ]);
  const total = totals?.n ?? 0;
  await audit.recordAccess(db, {
    actor: search.actor,
    kind: "search",
    entityType: "member",
    results: total,
    requestId: search.requestId,
  });
  return { ok: true, items, total };
}

export interface MemberRecord {
  id: string;
  fwoNumber: string;
  /** Null once D45's removal has run (`personalDataRedactedAt`). */
  fullName: string | null;
  /** Null: no personal phone (BR-06), or removed (D45). */
  phoneE164: string | null;
  status: MemberStatus;
  /** When D45 removed the name, phone and departments; null while they are held. */
  personalDataRedactedAt: Date | null;
  /** The reason given for the latest status change; null if it never changed. */
  statusReason: string | null;
  language: "en" | "sw";
  /** When imported from the parish list (D47); null when approved from a registration. */
  importedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  /** For optimistic concurrency: every change requires the version the administrator saw. */
  version: number;
  hbcId: string;
  /** Every HBC period, the current one first (FR-6: a transfer closes one and opens another). */
  hbcHistory: { hbcId: string; validFrom: Date; validTo: Date | null }[];
  /** Open department memberships (BR-05). */
  departments: { departmentId: string; state: "DECLARED" | "CONFIRMED" }[];
}

/**
 * Opens a member record (FR-6), recording `member.view` (BR-12, D31) before anything is
 * returned. Null when there is no such member.
 */
export async function openMember(
  db: DbOrTx,
  open: { memberId: string; actor: audit.StaffActor; requestId?: string },
): Promise<MemberRecord | null> {
  const { memberId } = open;
  if (!UUID.test(memberId)) return null;
  const [row] = await safeQuery(() =>
    db
      .select({
        id: member.id,
        fwoNumber: member.fwoNumber,
        fullName: member.fullName,
        phoneE164: member.phoneE164,
        status: member.status,
        statusReason: member.statusReason,
        personalDataRedactedAt: member.personalDataRedactedAt,
        language: member.language,
        importedAt: memberImport.createdAt,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
        version: member.version,
      })
      .from(member)
      .leftJoin(memberImport, eq(memberImport.id, member.importId))
      .where(eq(member.id, memberId)),
  );
  if (!row) return null;

  await audit.recordAccess(db, {
    actor: open.actor,
    kind: "view",
    entityType: "member",
    entityId: memberId,
    requestId: open.requestId,
  });

  const [hbcHistory, departments] = await Promise.all([
    safeQuery(() =>
      db
        .select({
          hbcId: memberHbcAssignment.hbcId,
          validFrom: memberHbcAssignment.validFrom,
          validTo: memberHbcAssignment.validTo,
        })
        .from(memberHbcAssignment)
        .where(eq(memberHbcAssignment.memberId, memberId))
        .orderBy(desc(memberHbcAssignment.validFrom)),
    ),
    safeQuery(() =>
      db
        .select({
          departmentId: departmentMembership.departmentId,
          state: departmentMembership.state,
        })
        .from(departmentMembership)
        .where(
          and(eq(departmentMembership.memberId, memberId), isNull(departmentMembership.validTo)),
        ),
    ),
  ]);
  const current = hbcHistory.find((p) => p.validTo === null);
  // Every member has one open period (domain-model invariant 2); without one, nothing is shown.
  if (!current) return null;
  return {
    ...row,
    hbcId: current.hbcId,
    hbcHistory,
    departments,
  };
}

// ---------------------------------------------------------------- changes

/**
 * Why a change was refused. Each is shown to the administrator as a plain message.
 * - `not_found`: no such member.
 * - `stale`: the record changed since it was opened.
 * - `closed`: the member is deceased or transferred out, so the record can't change.
 * - `invalid`: a field is wrong; `errors` says which.
 * - `unchanged`: nothing would change.
 * - `units`: the HBC or a department chosen isn't an active one (BR-04, BR-05).
 * - `phone_held`: the phone belongs to another active or inactive member (D20, BR-06).
 */
export type MemberChangeRefusal =
  "not_found" | "stale" | "closed" | "invalid" | "unchanged" | "units" | "phone_held";

export type MemberChangeResult<Field extends string> =
  | { ok: true }
  | { ok: false; reason: Exclude<MemberChangeRefusal, "invalid"> }
  | { ok: false; reason: "invalid"; errors: Partial<Record<Field, MemberFieldError>> };

class Refused extends Error {
  constructor(readonly reason: Exclude<MemberChangeRefusal, "invalid">) {
    super(reason);
  }
}

interface Change<Field extends string> {
  memberId: string;
  /** The version the administrator saw (`MemberRecord.version`). */
  version: number;
  reason: string;
  actor: audit.StaffActor;
  requestId?: string;
  /** For `invalid` answers. */
  errors?: Partial<Record<Field, MemberFieldError>>;
}

/**
 * Runs a change in one transaction, after locking the member at the version the administrator
 * saw: a concurrent change waits, then fails as `stale`. A closed record is refused.
 */
async function changeMember<Field extends string>(
  db: DbOrTx,
  change: Change<Field>,
  apply: (tx: Transaction, locked: LockedMember, reason: string) => Promise<void>,
): Promise<MemberChangeResult<Field>> {
  const errors: Partial<Record<Field | "reason", MemberFieldError>> = { ...change.errors };
  const reason = checkMemberReason(change.reason);
  if (!reason.ok) errors.reason = reason.error;
  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      reason: "invalid",
      errors: errors as Partial<Record<Field, MemberFieldError>>,
    };
  }
  if (!UUID.test(change.memberId)) return { ok: false, reason: "not_found" };
  try {
    await safeQuery(() =>
      db.transaction(async (tx) => {
        const [locked] = await tx
          .select({
            status: member.status,
            version: member.version,
            fullName: member.fullName,
            phoneE164: member.phoneE164,
            language: member.language,
          })
          .from(member)
          .where(eq(member.id, change.memberId))
          .for("update");
        if (!locked) throw new Refused("not_found");
        if (isClosedStatus(locked.status)) throw new Refused("closed");
        if (locked.version !== change.version) throw new Refused("stale");
        await apply(tx, locked, (reason as { value: string }).value);
      }),
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.reason };
    throw error;
  }
}

interface LockedMember {
  status: MemberStatus;
  version: number;
  fullName: string | null;
  phoneE164: string | null;
  language: "en" | "sw";
}

/** Bumps the version, so a form opened before this change fails as stale. */
const bumped = { version: sql`${member.version} + 1`, updatedAt: sql`now()` };

/**
 * Edits a member's details (FR-6): name, phone (or no personal phone), SMS language and
 * departments, with a reason, in one transaction with a `member.edit` audit entry holding the
 * changed values before and after and the reason (BR-12). Departments removed close their period
 * and departments added open a DECLARED one (BR-05); only active departments can be added, and
 * one the member already belongs to stays even if it has since been deactivated. A phone held by
 * another active or inactive member is refused (D20). No SMS is sent.
 */
export async function editMemberDetails(
  db: DbOrTx,
  edit: {
    memberId: string;
    version: number;
    fields: MemberDetailsFields;
    reason: string;
    actor: audit.StaffActor;
    requestId?: string;
  },
): Promise<MemberChangeResult<MemberDetailsFieldName | "reason">> {
  const checked = checkMemberDetails(edit.fields);
  return changeMember<MemberDetailsFieldName | "reason">(
    db,
    { ...edit, errors: checked.ok ? undefined : checked.errors },
    async (tx, locked, reason) => {
      const details = (checked as { ok: true; value: MemberDetails }).value;
      const { memberId } = edit;
      const open = await tx
        .select({ id: departmentMembership.departmentId })
        .from(departmentMembership)
        .where(
          and(eq(departmentMembership.memberId, memberId), isNull(departmentMembership.validTo)),
        );
      const current = open.map((d) => d.id);
      const added = details.departmentIds.filter((d) => !current.includes(d));
      const removed = current.filter((d) => !details.departmentIds.includes(d));

      const diff = audit.changes(
        {
          fullName: locked.fullName,
          phoneE164: locked.phoneE164,
          language: locked.language,
          departmentIds: [...current].sort(),
        },
        {
          fullName: details.fullName,
          phoneE164: details.phoneE164,
          language: details.language,
          departmentIds: [...details.departmentIds].sort(),
        },
      );
      if (Object.keys(diff.after).length === 0) throw new Refused("unchanged");

      if (added.length > 0) {
        const units = await checkUnitsForRegistration(tx, { hbcId: null, departmentIds: added });
        if (!units.ok) throw new Refused("units");
      }

      try {
        // In a savepoint, so the unique index's refusal comes back as a plain answer.
        await safeQuery(() =>
          tx.transaction((savepoint) =>
            savepoint
              .update(member)
              .set({
                fullName: details.fullName,
                phoneE164: details.phoneE164,
                language: details.language,
                ...bumped,
              })
              .where(eq(member.id, memberId)),
          ),
        );
      } catch (error) {
        if (isUniqueViolation(error, "member_phone_uq")) throw new Refused("phone_held");
        throw error;
      }

      if (removed.length > 0) {
        await tx
          .update(departmentMembership)
          .set({ validTo: sql`now()` })
          .where(
            and(
              eq(departmentMembership.memberId, memberId),
              inArray(departmentMembership.departmentId, removed),
              isNull(departmentMembership.validTo),
            ),
          );
      }
      if (added.length > 0) {
        await tx
          .insert(departmentMembership)
          .values(
            added.map((departmentId) => ({ memberId, departmentId, state: "DECLARED" as const })),
          );
      }

      await audit.write(tx, {
        actor: edit.actor,
        action: "member.edit",
        entityType: "member",
        entityId: memberId,
        before: diff.before,
        after: { ...diff.after, reason },
        requestId: edit.requestId,
      });
    },
  );
}

/**
 * Changes a member's status along the lifecycle (FR-6, domain-model.md §3), with a reason kept
 * as the record's `status_reason` and in a `member.change_status` audit entry. Marking a member
 * deceased or transferred out closes the record and releases their phone number for another
 * member (D20): `member_phone_uq` no longer counts it. That can't be undone here, so it needs
 * `confirmFinal`, the administrator's tick that this is the right member and the change is final.
 */
export async function changeMemberStatus(
  db: DbOrTx,
  change: {
    memberId: string;
    version: number;
    status: string;
    reason: string;
    /** Required to mark a member deceased or transferred out. */
    confirmFinal?: boolean;
    actor: audit.StaffActor;
    requestId?: string;
  },
): Promise<MemberChangeResult<"status" | "reason" | "confirmFinal">> {
  const status = (MEMBER_STATUSES as readonly string[]).includes(change.status)
    ? (change.status as MemberStatus)
    : null;
  const errors: Partial<Record<"status" | "confirmFinal", MemberFieldError>> = {};
  if (!status) errors.status = "required";
  else if (isClosedStatus(status) && !change.confirmFinal) errors.confirmFinal = "required";
  return changeMember<"status" | "reason" | "confirmFinal">(
    db,
    { ...change, errors },
    async (tx, locked, reason) => {
      // From an open status every other status is allowed (a closed record was refused
      // already), so the only move off the lifecycle is to the same status.
      if (status === locked.status) throw new Refused("unchanged");
      await tx
        .update(member)
        .set({ status: status!, statusReason: reason, ...bumped })
        .where(eq(member.id, change.memberId));
      await audit.write(tx, {
        actor: change.actor,
        action: "member.change_status",
        entityType: "member",
        entityId: change.memberId,
        before: { status: locked.status },
        after: { status: status!, reason },
        requestId: change.requestId,
      });
    },
  );
}

/**
 * Moves a member to another active HBC (FR-6, BR-04): closes the open period and opens the new
 * one at the same instant, in one transaction with a `member.transfer_hbc` audit entry (ADR
 * 0003). The exclusion constraint and `member_hbc_one_open_uq` refuse an overlap from any path.
 */
export async function transferMemberHbc(
  db: DbOrTx,
  transfer: {
    memberId: string;
    version: number;
    hbcId: string;
    reason: string;
    actor: audit.StaffActor;
    requestId?: string;
  },
): Promise<MemberChangeResult<"hbcId" | "reason">> {
  const hbcId = transfer.hbcId.trim();
  return changeMember<"hbcId" | "reason">(
    db,
    { ...transfer, errors: hbcId ? undefined : { hbcId: "required" } },
    async (tx, _locked, reason) => {
      const { memberId } = transfer;
      const [current] = await tx
        .select({ hbcId: memberHbcAssignment.hbcId })
        .from(memberHbcAssignment)
        .where(
          and(eq(memberHbcAssignment.memberId, memberId), isNull(memberHbcAssignment.validTo)),
        );
      if (current?.hbcId === hbcId) throw new Refused("unchanged");
      const units = await checkUnitsForRegistration(tx, { hbcId, departmentIds: [] });
      if (!units.ok) throw new Refused("units");

      // One instant, the transaction's `now()`, ends the old period and starts the new one.
      await tx
        .update(memberHbcAssignment)
        .set({ validTo: sql`now()` })
        .where(
          and(eq(memberHbcAssignment.memberId, memberId), isNull(memberHbcAssignment.validTo)),
        );
      // `valid_from` defaults to `now()`: the same instant.
      await tx.insert(memberHbcAssignment).values({ memberId, hbcId });
      await tx.update(member).set(bumped).where(eq(member.id, memberId));

      await audit.write(tx, {
        actor: transfer.actor,
        action: "member.transfer_hbc",
        entityType: "member",
        entityId: memberId,
        before: { hbcId: current?.hbcId ?? null },
        after: { hbcId, reason },
        requestId: transfer.requestId,
      });
    },
  );
}
