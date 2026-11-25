import { and, asc, eq, inArray } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";
import { department, hbc } from "../../db/schema";

/** An HBC or department as a form shows it: its id and name. */
export interface Unit {
  id: string;
  name: string;
}

/** Active HBCs in sort order, for the HBC choice on registration forms (FR-1, FR-3). */
export async function listActiveHbcs(db: DbOrTx): Promise<Unit[]> {
  return safeQuery(() =>
    db
      .select({ id: hbc.id, name: hbc.name })
      .from(hbc)
      .where(eq(hbc.isActive, true))
      .orderBy(asc(hbc.sortOrder), asc(hbc.name)),
  );
}

/** Active departments in sort order, for the department choices on registration forms. */
export async function listActiveDepartments(db: DbOrTx): Promise<Unit[]> {
  return safeQuery(() =>
    db
      .select({ id: department.id, name: department.name })
      .from(department)
      .where(eq(department.isActive, true))
      .orderBy(asc(department.sortOrder), asc(department.name)),
  );
}

export type UnitCheck =
  | { ok: true }
  | {
      ok: false;
      /** The chosen HBC is inactive or doesn't exist. */
      hbcUnavailable: boolean;
      /** The chosen departments that are inactive or don't exist. */
      unavailableDepartmentIds: string[];
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Checks the HBC and departments chosen on a new registration (database-design.md §3,
 * requirements "a deactivated unit cannot be chosen on new registrations", BR-04). An id that
 * is inactive, unknown or not a lowercase uuid is unavailable; the form can't tell which, and
 * doesn't need to. Departments are optional (BR-05), so an empty list is fine.
 *
 * Pass the registration's transaction to check inside it. A unit deactivated a moment after
 * the check is not a concern: deactivation only stops new choices.
 */
export async function checkUnitsForRegistration(
  db: DbOrTx,
  choice: { hbcId: string; departmentIds: readonly string[] },
): Promise<UnitCheck> {
  // Ids come from the lists above, which Postgres returns lowercase; anything else is
  // unavailable, the safe answer. Each unavailable id is reported once.
  const { hbcId } = choice;
  const departmentIds = [...new Set(choice.departmentIds)];
  const wellFormed = departmentIds.filter((id) => UUID.test(id));

  const activeHbc = UUID.test(hbcId)
    ? await safeQuery(() =>
        db
          .select({ id: hbc.id })
          .from(hbc)
          .where(and(eq(hbc.id, hbcId), eq(hbc.isActive, true))),
      )
    : [];
  const activeDepartments = wellFormed.length
    ? await safeQuery(() =>
        db
          .select({ id: department.id })
          .from(department)
          .where(and(inArray(department.id, wellFormed), eq(department.isActive, true))),
      )
    : [];

  const active = new Set(activeDepartments.map((d) => d.id));
  const hbcUnavailable = activeHbc.length === 0;
  const unavailableDepartmentIds = departmentIds.filter((id) => !active.has(id));
  if (!hbcUnavailable && unavailableDepartmentIds.length === 0) return { ok: true };
  return { ok: false, hbcUnavailable, unavailableDepartmentIds };
}
