import { and, inArray } from "drizzle-orm";
import { isUniqueViolation, safeQuery, type DbOrTx } from "../../db";
import { departmentMembership, member, memberHbcAssignment, memberImport } from "../../db/schema";
import * as audit from "../audit";
import { listActiveDepartments, listActiveHbcs, unitKey } from "../organisation";
import { normalizeKenyanPhone } from "../verification";
import { normalizeLineEnds, parseCsv } from "./csv";

/**
 * The import of the parish list (D47, FR-13, #104). The Church Secretary's cleaned list arrives
 * as CSV text; every row is checked against the rules and the registry, and only rows that pass
 * become members. Nothing is guessed: a row that breaks a rule is skipped and reported by its
 * row number and the rule, never by its contents, and nothing from the file is logged.
 */

/** The largest file the page accepts, and the most rows: the parish has about 600 adults (D15). */
export const IMPORT_MAX_BYTES = 512 * 1024;
export const IMPORT_MAX_ROWS = 2000;

/** The columns, by their header in the file. Headers are matched ignoring case and spaces. */
export const IMPORT_COLUMNS = {
  required: ["fwo_number", "full_name", "phone", "hbc"],
  optional: ["departments", "language"],
} as const;
type Column = (typeof IMPORT_COLUMNS.required)[number] | (typeof IMPORT_COLUMNS.optional)[number];

/** Departments in one cell are separated by semicolons: commas separate the file's columns. */
export const DEPARTMENT_SEPARATOR = ";";

/** Why a whole file can't be read. */
export type ImportFileError =
  | { kind: "unclosed_quote" }
  | { kind: "empty" }
  | { kind: "missing_columns"; columns: string[] }
  | { kind: "repeated_columns"; columns: string[] }
  | { kind: "too_many_rows"; limit: number };

/** Why one row is skipped: a rule, never a value from the row. */
export type ImportProblem =
  | "fwo_missing"
  | "fwo_invalid" // BR-01: digits only
  | "fwo_held" // BR-02: already a member's
  | "fwo_repeated" // the same FWO on another row of the file
  | "name_missing"
  | "name_too_short"
  | "name_too_long"
  | "phone_invalid" // BR-06: not a Kenyan mobile
  | "phone_held" // BR-06, D20: an active or inactive member's
  | "phone_repeated" // the same phone on another row of the file
  | "hbc_missing"
  | "hbc_unknown" // BR-04: no active HBC of that name
  | "department_unknown" // BR-05: no active department of that name
  | "language_invalid"
  | "extra_cells" // more cells than headers: often an unquoted comma in a name
  | "control_characters"; // invisible characters the database refuses

/** Control characters other than tab and line ends. */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

export interface ImportRow {
  /** The row's number in the spreadsheet: the header is row 1. */
  rowNumber: number;
  cells: Partial<Record<Column, string>>;
  extraCells: boolean;
}

export type ReadImportResult =
  { ok: true; rows: ImportRow[] } | { ok: false; error: ImportFileError };

function headerKey(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Splits the file into rows under their headers. Blank rows are left out. */
export function readImportFile(text: string): ReadImportResult {
  const parsed = parseCsv(text);
  if (!parsed.ok) return { ok: false, error: { kind: "unclosed_quote" } };
  const [headerRow, ...body] = parsed.rows;
  if (!headerRow) return { ok: false, error: { kind: "empty" } };

  const keys = headerRow.map(headerKey);
  const known = new Set<string>([...IMPORT_COLUMNS.required, ...IMPORT_COLUMNS.optional]);
  const repeated = [...new Set(keys.filter((k, i) => known.has(k) && keys.indexOf(k) !== i))];
  if (repeated.length > 0)
    return { ok: false, error: { kind: "repeated_columns", columns: repeated } };
  const missing = IMPORT_COLUMNS.required.filter((c) => !keys.includes(c));
  if (missing.length > 0)
    return { ok: false, error: { kind: "missing_columns", columns: missing } };

  const rows: ImportRow[] = [];
  body.forEach((cells, index) => {
    if (cells.every((cell) => cell.trim() === "")) return;
    const row: ImportRow = { rowNumber: index + 2, cells: {}, extraCells: false };
    cells.forEach((cell, column) => {
      const key = keys[column];
      if (key === undefined) {
        if (cell.trim() !== "") row.extraCells = true;
      } else if (known.has(key)) {
        row.cells[key as Column] = cell;
      }
    });
    rows.push(row);
  });
  if (rows.length === 0) return { ok: false, error: { kind: "empty" } };
  if (rows.length > IMPORT_MAX_ROWS) {
    return { ok: false, error: { kind: "too_many_rows", limit: IMPORT_MAX_ROWS } };
  }
  return { ok: true, rows };
}

export interface ValidImportRow {
  rowNumber: number;
  fwoNumber: string;
  fullName: string;
  /** Null: no personal phone (BR-06). */
  phoneE164: string | null;
  hbcId: string;
  departmentIds: string[];
  language: "en" | "sw";
}

export interface SkippedImportRow {
  rowNumber: number;
  problems: ImportProblem[];
}

/** What the registry already holds, for the row checks. */
export interface ImportLookups {
  /** Active HBCs and departments by `unitKey` of their name. */
  hbcs: Map<string, string>;
  departments: Map<string, string>;
  /** FWO numbers held by any member (BR-02); phones held by an active or inactive member. */
  heldFwoNumbers: Set<string>;
  heldPhones: Set<string>;
}

/**
 * Checks every row (pure: the registry's state comes in `lookups`). A row sharing its FWO number
 * or phone with another row is skipped with every row it shares it with: the file can't say
 * which one is right.
 */
export function checkImportRows(
  rows: ImportRow[],
  lookups: ImportLookups,
): { valid: ValidImportRow[]; skipped: SkippedImportRow[] } {
  const checked = rows.map((row) => checkRow(row, lookups));
  const fwoCounts = countBy(checked.map((c) => c.fwoNumber));
  const phoneCounts = countBy(checked.map((c) => c.phoneE164));

  const valid: ValidImportRow[] = [];
  const skipped: SkippedImportRow[] = [];
  for (const c of checked) {
    const problems = [...c.problems];
    if (c.fwoNumber && (fwoCounts.get(c.fwoNumber) ?? 0) > 1) problems.push("fwo_repeated");
    if (c.phoneE164 && (phoneCounts.get(c.phoneE164) ?? 0) > 1) problems.push("phone_repeated");
    if (problems.length > 0) {
      skipped.push({ rowNumber: c.rowNumber, problems });
    } else {
      valid.push({
        rowNumber: c.rowNumber,
        fwoNumber: c.fwoNumber!,
        fullName: c.fullName!,
        phoneE164: c.phoneE164,
        hbcId: c.hbcId!,
        departmentIds: c.departmentIds,
        language: c.language,
      });
    }
  }
  return { valid, skipped };
}

function countBy(values: (string | null | undefined)[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return counts;
}

interface CheckedRow {
  rowNumber: number;
  problems: ImportProblem[];
  fwoNumber?: string;
  fullName?: string;
  phoneE164: string | null;
  hbcId?: string;
  departmentIds: string[];
  language: "en" | "sw";
}

function checkRow(row: ImportRow, lookups: ImportLookups): CheckedRow {
  const problems: ImportProblem[] = [];
  const cell = (column: Column) => (row.cells[column] ?? "").trim();
  if (row.extraCells) problems.push("extra_cells");
  // A control character (a NUL byte, say) would make the database refuse the whole import.
  if (Object.values(row.cells).some((v) => CONTROL.test(v ?? ""))) {
    problems.push("control_characters");
  }

  // BR-01: digits only, kept exactly as written: "0042" and "42" are different numbers (D29).
  const fwo = cell("fwo_number");
  let fwoNumber: string | undefined;
  if (!fwo) problems.push("fwo_missing");
  else if (!/^[0-9]+$/.test(fwo)) problems.push("fwo_invalid");
  else {
    fwoNumber = fwo;
    if (lookups.heldFwoNumbers.has(fwo)) problems.push("fwo_held");
  }

  // The database CHECK's rule: 2–120 characters, counted as Postgres counts them (code points).
  const name = cell("full_name").replace(/\s+/g, " ");
  const nameLength = [...name].length;
  if (!name) problems.push("name_missing");
  else if (nameLength < 2) problems.push("name_too_short");
  else if (nameLength > 120) problems.push("name_too_long");

  // Blank: no personal phone (BR-06). Otherwise a Kenyan mobile held by no member.
  const phone = cell("phone");
  let phoneE164: string | null = null;
  if (phone) {
    phoneE164 = normalizeKenyanPhone(phone);
    if (!phoneE164) problems.push("phone_invalid");
    else if (lookups.heldPhones.has(phoneE164)) problems.push("phone_held");
  }

  const hbcName = cell("hbc");
  const hbcId = hbcName ? lookups.hbcs.get(unitKey(hbcName)) : undefined;
  if (!hbcName) problems.push("hbc_missing");
  else if (!hbcId) problems.push("hbc_unknown");

  const departmentIds: string[] = [];
  for (const part of cell("departments").split(DEPARTMENT_SEPARATOR)) {
    if (!part.trim()) continue;
    const id = lookups.departments.get(unitKey(part));
    if (!id) {
      if (!problems.includes("department_unknown")) problems.push("department_unknown");
    } else if (!departmentIds.includes(id)) {
      departmentIds.push(id);
    }
  }

  // English unless the file says otherwise (D44).
  const lang = cell("language").toLowerCase();
  let language: "en" | "sw" = "en";
  if (lang === "sw") language = "sw";
  else if (lang !== "" && lang !== "en") problems.push("language_invalid");

  return {
    rowNumber: row.rowNumber,
    problems,
    fwoNumber,
    fullName: name || undefined,
    phoneE164: phoneE164 && !problems.includes("phone_invalid") ? phoneE164 : null,
    hbcId,
    departmentIds,
    language,
  };
}

/** Reads the registry state the row checks need, for the FWO numbers and phones in `rows`. */
async function loadLookups(db: DbOrTx, rows: ImportRow[]): Promise<ImportLookups> {
  const fwoNumbers = [
    ...new Set(
      rows.map((r) => (r.cells.fwo_number ?? "").trim()).filter((v) => /^[0-9]+$/.test(v)),
    ),
  ];
  const phones = [
    ...new Set(
      rows
        .map((r) => normalizeKenyanPhone(r.cells.phone ?? ""))
        .filter((v): v is string => v !== null),
    ),
  ];
  // One query after another: inside a transaction they share one connection.
  const hbcs = await listActiveHbcs(db);
  const departments = await listActiveDepartments(db);
  const heldFwo =
    fwoNumbers.length === 0
      ? []
      : await safeQuery(() =>
          db
            .select({ v: member.fwoNumber })
            .from(member)
            .where(inArray(member.fwoNumber, fwoNumbers)),
        );
  const heldPhone =
    phones.length === 0
      ? []
      : await safeQuery(() =>
          db
            .select({ v: member.phoneE164 })
            .from(member)
            .where(
              and(
                inArray(member.phoneE164, phones),
                inArray(member.status, ["ACTIVE", "INACTIVE"]),
              ),
            ),
        );
  return {
    hbcs: unitsByKey(hbcs),
    departments: unitsByKey(departments),
    heldFwoNumbers: new Set(heldFwo.map((r) => r.v)),
    heldPhones: new Set(heldPhone.map((r) => r.v).filter((v): v is string => v !== null)),
  };
}

/**
 * Active units by `unitKey`. Two units whose names differ only in case, spacing or apostrophes
 * share a key: neither is matched, so no row goes to the wrong one by chance.
 */
/**
 * The date the Vicar confirmed the members' consent (BR-15, D47): a real calendar date written
 * YYYY-MM-DD, and not after `today` (the same form, in the parish's time zone). Round-tripped,
 * because JavaScript reads 31 February as a date in March.
 */
export function checkConsentDate(value: string, today: string): "invalid" | "future" | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "invalid";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return "invalid";
  }
  return value > today ? "future" : null;
}

export function unitsByKey(units: { id: string; name: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const unit of units) {
    const key = unitKey(unit.name);
    if (map.has(key)) ambiguous.add(key);
    map.set(key, unit.id);
  }
  for (const key of ambiguous) map.delete(key);
  return map;
}

/** The SHA-256 of the file's text, so the confirmation is tied to the file previewed. */
export async function importDigest(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ImportPreview =
  | {
      ok: true;
      digest: string;
      /** Rows that will become members. */
      toImport: number;
      skipped: SkippedImportRow[];
    }
  | { ok: false; error: ImportFileError };

/** FR-13's preview: what would be imported and what skipped, and why. Stores nothing. */
export async function previewImport(db: DbOrTx, input: string): Promise<ImportPreview> {
  const text = normalizeLineEnds(input);
  const read = readImportFile(text);
  if (!read.ok) return read;
  const { valid, skipped } = checkImportRows(read.rows, await loadLookups(db, read.rows));
  return { ok: true, digest: await importDigest(text), toImport: valid.length, skipped };
}

export type ImportResult =
  | {
      ok: true;
      importId: string;
      imported: number;
      skipped: number;
      /** For flagging open registrations (BR-03, BR-06): in memory only, never logged. */
      fwoNumbers: string[];
      phones: string[];
    }
  | { ok: false; reason: "file_changed" }
  /** No row can be imported now: here is the fresh check. */
  | { ok: false; reason: "nothing_to_import"; preview: ImportPreview }
  /** The registry changed since the preview: preview again. */
  | { ok: false; reason: "registry_changed"; preview: ImportPreview }
  | { ok: false; reason: "file"; error: ImportFileError };

/** Thrown inside the transaction to roll it back when a member insert hits a unique index. */
class RegistryChanged extends Error {}

/**
 * FR-13's confirmation. Checks the file again, in the transaction that imports it, and refuses
 * if it isn't the file previewed (`digest`) or no longer gives the count the administrator saw
 * (`expectedCount`). Then, in one transaction: the `member_import` record; every valid row as an
 * ACTIVE member with its HBC period and DECLARED departments; a `member.create` audit entry per
 * member and a `member_import.create` entry with the counts (rule 4). No SMS is sent. A FWO
 * number or phone taken since the check fails a unique index and rolls everything back.
 *
 * The caller checks the Membership Administrator role first (CLAUDE.md rule 1) and that the
 * administrator confirmed the Vicar's consent confirmation (BR-15, D47).
 */
export async function importMembers(
  db: DbOrTx,
  request: {
    text: string;
    digest: string;
    expectedCount: number;
    consentConfirmedOn: string;
    privacyNoticeVersion: string;
    actor: audit.StaffActor;
    requestId?: string;
  },
): Promise<ImportResult> {
  const text = normalizeLineEnds(request.text);
  if ((await importDigest(text)) !== request.digest) {
    return { ok: false, reason: "file_changed" };
  }
  const read = readImportFile(text);
  if (!read.ok) return { ok: false, reason: "file", error: read.error };

  try {
    return await safeQuery(() =>
      db.transaction(async (tx): Promise<ImportResult> => {
        const { valid, skipped } = checkImportRows(read.rows, await loadLookups(tx, read.rows));
        if (valid.length === 0) {
          return {
            ok: false,
            reason: "nothing_to_import",
            preview: { ok: true, digest: request.digest, toImport: 0, skipped },
          };
        }
        if (valid.length !== request.expectedCount) {
          return {
            ok: false,
            reason: "registry_changed",
            preview: { ok: true, digest: request.digest, toImport: valid.length, skipped },
          };
        }

        const [batch] = await tx
          .insert(memberImport)
          .values({
            importedByUserId: request.actor.userId,
            consentConfirmedOn: request.consentConfirmedOn,
            privacyNoticeVersion: request.privacyNoticeVersion,
            rowsImported: valid.length,
            rowsSkipped: skipped.length,
          })
          .returning({ id: memberImport.id });
        const importId = batch!.id;

        let created: { id: string; fwoNumber: string }[];
        try {
          created = await safeQuery(() =>
            tx.transaction((savepoint) =>
              savepoint
                .insert(member)
                .values(
                  valid.map((row) => ({
                    fwoNumber: row.fwoNumber,
                    fullName: row.fullName,
                    phoneE164: row.phoneE164,
                    language: row.language,
                    importId,
                  })),
                )
                .returning({ id: member.id, fwoNumber: member.fwoNumber }),
            ),
          );
        } catch (error) {
          if (
            isUniqueViolation(error, "member_fwo_uq") ||
            isUniqueViolation(error, "member_phone_uq")
          ) {
            throw new RegistryChanged();
          }
          throw error;
        }
        const idOf = new Map(created.map((c) => [c.fwoNumber, c.id]));
        const rows = valid.map((row) => ({ ...row, memberId: idOf.get(row.fwoNumber)! }));

        await tx
          .insert(memberHbcAssignment)
          .values(rows.map((row) => ({ memberId: row.memberId, hbcId: row.hbcId })));
        const departments = rows.flatMap((row) =>
          row.departmentIds.map((departmentId) => ({
            memberId: row.memberId,
            departmentId,
            state: "DECLARED" as const,
          })),
        );
        if (departments.length > 0) await tx.insert(departmentMembership).values(departments);

        // The details are in the member records; the entries say where each came from.
        await audit.writeMany(tx, [
          ...rows.map((row) => ({
            actor: request.actor,
            action: "member.create" as const,
            entityType: "member" as const,
            entityId: row.memberId,
            after: {
              status: "ACTIVE",
              importId,
              hbcId: row.hbcId,
              departments: row.departmentIds.length,
              noPersonalPhone: row.phoneE164 === null,
            },
            requestId: request.requestId,
          })),
          {
            actor: request.actor,
            action: "member_import.create" as const,
            entityType: "member_import" as const,
            entityId: importId,
            after: {
              imported: valid.length,
              skipped: skipped.length,
              consentConfirmedOn: request.consentConfirmedOn,
              privacyNoticeVersion: request.privacyNoticeVersion,
            },
            requestId: request.requestId,
          },
        ]);
        return {
          ok: true,
          importId,
          imported: valid.length,
          skipped: skipped.length,
          fwoNumbers: rows.map((row) => row.fwoNumber),
          phones: rows.map((row) => row.phoneE164).filter((p): p is string => p !== null),
        };
      }),
    );
  } catch (error) {
    if (error instanceof RegistryChanged) {
      return {
        ok: false,
        reason: "registry_changed",
        preview: await previewImport(db, text),
      };
    }
    throw error;
  }
}
