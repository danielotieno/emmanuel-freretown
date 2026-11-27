import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { safeQuery, type DbOrTx } from "../../db";
import {
  department,
  departmentMembership,
  hbc,
  member,
  memberHbcAssignment,
} from "../../db/schema";
import * as audit from "../audit";
import { formatKenyanPhone } from "../verification";
import { toCsv } from "./csv";
import { DEPARTMENT_SEPARATOR } from "./import";

/**
 * The export's columns, named as in the import of the parish list (FR-13), so staff see one
 * format both ways (FR-12: name, FWO, phone, HBC, departments).
 */
const EXPORT_COLUMNS = ["fwo_number", "full_name", "phone", "hbc", "departments"] as const;

export interface MemberExport {
  csv: string;
  /** Members in the file, not counting the header. */
  rows: number;
}

/**
 * The one CSV export (FR-12, #25): every ACTIVE member, approved from a registration or imported
 * from the parish list (an imported member counts as approved, D47), by name. The phone is
 * written `0712 345 678`, or left blank for no personal phone; departments are the open
 * memberships, separated as in the import. Exporting is access to personal data, so
 * `member.export` is recorded with the number of rows (BR-12, D31) before the file is returned;
 * if it can't be, there is no file. Callers check for a Membership Administrator first
 * (CLAUDE.md rule 1).
 */
export async function exportActiveMembers(
  db: DbOrTx,
  request: { actor: audit.StaffActor; requestId?: string },
): Promise<MemberExport> {
  const departments = sql<string>`coalesce((
    SELECT string_agg(${department.name}, ${`${DEPARTMENT_SEPARATOR} `}
                      ORDER BY ${department.sortOrder}, ${department.name})
      FROM ${departmentMembership}
      JOIN ${department} ON ${department.id} = ${departmentMembership.departmentId}
     WHERE ${departmentMembership.memberId} = ${member.id}
       AND ${departmentMembership.validTo} IS NULL), '')`;
  const members = await safeQuery(() =>
    db
      .select({
        fwoNumber: member.fwoNumber,
        fullName: member.fullName,
        phoneE164: member.phoneE164,
        hbc: hbc.name,
        departments,
      })
      .from(member)
      .innerJoin(
        memberHbcAssignment,
        and(eq(memberHbcAssignment.memberId, member.id), isNull(memberHbcAssignment.validTo)),
      )
      .innerJoin(hbc, eq(hbc.id, memberHbcAssignment.hbcId))
      .where(eq(member.status, "ACTIVE"))
      .orderBy(asc(member.fullName), asc(member.id)),
  );

  await audit.recordAccess(db, {
    actor: request.actor,
    kind: "export",
    entityType: "member",
    rows: members.length,
    requestId: request.requestId,
  });

  const csv = toCsv([
    [...EXPORT_COLUMNS],
    ...members.map((m) => [
      m.fwoNumber,
      m.fullName,
      m.phoneE164 ? formatKenyanPhone(m.phoneE164) : "",
      m.hbc,
      m.departments,
    ]),
  ]);
  return { csv, rows: members.length };
}
