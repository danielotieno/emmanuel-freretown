import { asc, eq, sql } from "drizzle-orm";
import { isUniqueViolation, safeQuery, type DbOrTx, type Transaction } from "../../db";
import { department, hbc } from "../../db/schema";
import * as audit from "../audit";

/**
 * Reference data administration (FR-9, #23): Membership Administrators add, rename, reorder,
 * deactivate and reactivate HBCs and departments. A unit is never deleted: registrations,
 * members and the audit log refer to it, and a rename keeps its id, so history keeps pointing at
 * it (requirements §4). Every change writes its audit entry in the same transaction (rule 4).
 * Callers check for a Membership Administrator first (CLAUDE.md rule 1).
 */

export const UNIT_KINDS = ["hbc", "department"] as const;
export type UnitKind = (typeof UNIT_KINDS)[number];

/** A unit as the administration page lists it, in sort order. */
export interface UnitRow {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export type UnitNameError = "required" | "too_short" | "too_long" | "invalid";

export type UnitChangeRefusal =
  | "not_found"
  | "unchanged"
  /** Another unit of the same kind has this name, ignoring case, spacing and curly quotes. */
  | "name_taken"
  /** Every member needs an HBC, and new registrations need one to choose (BR-04). */
  | "last_active_hbc";

export type UnitChangeResult =
  | { ok: true }
  | { ok: false; reason: UnitChangeRefusal }
  | { ok: false; reason: "invalid"; error: UnitNameError };

/**
 * A name compared without regard to case, spaces around and between words, or curly quotes:
 * the import of the parish list matches units this way (FR-13), so no two units of a kind may
 * share one.
 */
export function unitKey(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").replace(/[‘’]/g, "'").toLowerCase();
}

/**
 * A unit's name: NFC, trimmed, single spaces, 2–80 characters (the tables' CHECK). No control
 * or invisible format characters (zero-width spaces, bidi overrides): a name that looks like
 * another must compare like it, and must show as typed on public pages.
 */
export function checkUnitName(
  input: string,
): { ok: true; value: string } | { ok: false; error: UnitNameError } {
  const value = input.normalize("NFC").trim().replace(/\s+/g, " ");
  if (value === "") return { ok: false, error: "required" };
  if (/[\p{Cc}\p{Cf}]/u.test(value)) return { ok: false, error: "invalid" };
  const length = [...value].length;
  if (length < 2) return { ok: false, error: "too_short" };
  if (length > 80) return { ok: false, error: "too_long" };
  return { ok: true, value };
}

/** Both tables have the same columns; one type serves both. */
function tableOf(kind: UnitKind) {
  return (kind === "hbc" ? hbc : department) as unknown as typeof hbc;
}

/** Every unit of a kind, active or not, in sort order (FR-9). A list page: not recorded. */
export async function listUnits(db: DbOrTx, kind: UnitKind): Promise<UnitRow[]> {
  const t = tableOf(kind);
  return safeQuery(() =>
    db
      .select({ id: t.id, name: t.name, isActive: t.isActive, sortOrder: t.sortOrder })
      .from(t)
      .orderBy(asc(t.sortOrder), asc(t.name)),
  );
}

interface Change {
  kind: UnitKind;
  actor: audit.StaffActor;
  requestId?: string;
}

class Refused extends Error {
  constructor(readonly reason: UnitChangeRefusal) {
    super(reason);
  }
}

/**
 * Runs a change with every unit of its kind locked, in sort order: changes to one kind queue,
 * and each sees the whole list (names to compare, neighbours to swap). The lock is FOR NO KEY
 * UPDATE, not FOR UPDATE: these changes never touch a key, and FOR UPDATE would block (and could
 * deadlock with) every registration, approval or import inserting a row that refers to a unit,
 * whose foreign-key check takes FOR KEY SHARE. A refusal or a name taken at the last moment
 * (`hbc_name_uq`) rolls everything back.
 */
async function change(
  db: DbOrTx,
  kind: UnitKind,
  run: (tx: Transaction, units: UnitRow[]) => Promise<void>,
): Promise<UnitChangeResult> {
  const t = tableOf(kind);
  try {
    await db.transaction(async (tx) => {
      const units = await safeQuery(() =>
        tx
          .select({ id: t.id, name: t.name, isActive: t.isActive, sortOrder: t.sortOrder })
          .from(t)
          .orderBy(asc(t.sortOrder), asc(t.name))
          .for("no key update"),
      );
      await run(tx, units);
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.reason };
    if (isUniqueViolation(error)) return { ok: false, reason: "name_taken" };
    throw error;
  }
}

function entry(
  c: Change,
  id: string,
  verb: string,
  values: { before?: audit.AuditValues; after?: audit.AuditValues },
): audit.AuditEntry {
  // TypeScript can't tie the action's prefix to a kind chosen at run time; audit.write checks it.
  return {
    actor: c.actor,
    entityType: c.kind,
    action: `${c.kind}.${verb}`,
    entityId: id,
    ...values,
    requestId: c.requestId,
  } as audit.AuditEntry;
}

function nameTaken(units: UnitRow[], name: string, except?: string): boolean {
  const key = unitKey(name);
  return units.some((u) => u.id !== except && unitKey(u.name) === key);
}

/** Adds a unit at the end of the list, active (`<kind>.create`). */
export async function addUnit(db: DbOrTx, c: Change & { name: string }): Promise<UnitChangeResult> {
  const name = checkUnitName(c.name);
  if (!name.ok) return { ok: false, reason: "invalid", error: name.error };
  const t = tableOf(c.kind);
  return change(db, c.kind, async (tx, units) => {
    if (nameTaken(units, name.value)) throw new Refused("name_taken");
    const sortOrder = Math.max(0, ...units.map((u) => u.sortOrder)) + 1;
    const [added] = await safeQuery(() =>
      tx.insert(t).values({ name: name.value, sortOrder }).returning({ id: t.id }),
    );
    await audit.write(
      tx,
      entry(c, added!.id, "create", { after: { name: name.value, sortOrder } }),
    );
  });
}

/**
 * Renames a unit (`<kind>.rename`, the old and new names). The id stays, so every registration,
 * member and audit entry that refers to it shows the new name; the audit log keeps the old one.
 */
export async function renameUnit(
  db: DbOrTx,
  c: Change & { id: string; name: string },
): Promise<UnitChangeResult> {
  const name = checkUnitName(c.name);
  if (!name.ok) return { ok: false, reason: "invalid", error: name.error };
  const t = tableOf(c.kind);
  return change(db, c.kind, async (tx, units) => {
    const unit = units.find((u) => u.id === c.id);
    if (!unit) throw new Refused("not_found");
    if (unit.name === name.value) throw new Refused("unchanged");
    if (nameTaken(units, name.value, unit.id)) throw new Refused("name_taken");
    await safeQuery(() =>
      tx
        .update(t)
        .set({ name: name.value, updatedAt: sql`now()` })
        .where(eq(t.id, unit.id)),
    );
    await audit.write(
      tx,
      entry(c, unit.id, "rename", { before: { name: unit.name }, after: { name: name.value } }),
    );
  });
}

/**
 * Moves a unit one place up or down the list, which is the order forms offer them in. The list
 * is numbered 1, 2, 3… again, and each unit whose number changed gets a `<kind>.reorder` entry.
 */
export async function moveUnit(
  db: DbOrTx,
  c: Change & { id: string; direction: "up" | "down" },
): Promise<UnitChangeResult> {
  const t = tableOf(c.kind);
  return change(db, c.kind, async (tx, units) => {
    const from = units.findIndex((u) => u.id === c.id);
    if (from < 0) throw new Refused("not_found");
    const to = c.direction === "up" ? from - 1 : from + 1;
    if (to < 0 || to >= units.length) throw new Refused("unchanged");
    const order = [...units];
    [order[from], order[to]] = [order[to]!, order[from]!];
    const moved = order
      .map((unit, i) => ({ unit, sortOrder: i + 1 }))
      .filter(({ unit, sortOrder }) => unit.sortOrder !== sortOrder);
    for (const { unit, sortOrder } of moved) {
      await safeQuery(() =>
        tx
          .update(t)
          .set({ sortOrder, updatedAt: sql`now()` })
          .where(eq(t.id, unit.id)),
      );
    }
    await audit.writeMany(
      tx,
      moved.map(({ unit, sortOrder }) =>
        entry(c, unit.id, "reorder", {
          before: { sortOrder: unit.sortOrder },
          after: { sortOrder },
        }),
      ),
    );
  });
}

/**
 * Deactivates or reactivates a unit (`<kind>.deactivate`, `<kind>.activate`). A deactivated unit
 * can't be chosen on new registrations, corrections, transfers or member edits; registrations
 * and members already in it keep it (requirements §4). The last active HBC can't be deactivated.
 */
export async function setUnitActive(
  db: DbOrTx,
  c: Change & { id: string; active: boolean },
): Promise<UnitChangeResult> {
  const t = tableOf(c.kind);
  return change(db, c.kind, async (tx, units) => {
    const unit = units.find((u) => u.id === c.id);
    if (!unit) throw new Refused("not_found");
    if (unit.isActive === c.active) throw new Refused("unchanged");
    if (c.kind === "hbc" && !c.active && units.filter((u) => u.isActive).length === 1) {
      throw new Refused("last_active_hbc");
    }
    await safeQuery(() =>
      tx
        .update(t)
        .set({ isActive: c.active, updatedAt: sql`now()` })
        .where(eq(t.id, unit.id)),
    );
    await audit.write(
      tx,
      entry(c, unit.id, c.active ? "activate" : "deactivate", {
        before: { isActive: unit.isActive },
        after: { isActive: c.active },
      }),
    );
  });
}
