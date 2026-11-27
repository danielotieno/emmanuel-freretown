import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, FWO_PATTERN, id, PHONE_E164_PATTERN, tz, updatedAt } from "./columns";
import { department, hbc } from "./organisation";
import { registration } from "./registration";

/** One import of the parish list (D47, FR-13): who, how many, on whose consent. Never the file. */
export const memberImport = pgTable(
  "member_import",
  {
    id: id(),
    importedByUserId: text("imported_by_user_id").notNull(),
    /** The date of the Vicar's confirmation of the members' consent (BR-15). */
    consentConfirmedOn: date("consent_confirmed_on", { mode: "string" }).notNull(),
    privacyNoticeVersion: text("privacy_notice_version").notNull(),
    rowsImported: integer("rows_imported").notNull(),
    rowsSkipped: integer("rows_skipped").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    check("member_import_rows_imported_check", sql`${t.rowsImported} > 0`),
    check("member_import_rows_skipped_check", sql`${t.rowsSkipped} >= 0`),
  ],
);

export const member = pgTable(
  "member",
  {
    id: id(),
    fwoNumber: text("fwo_number").notNull(),
    fullName: text("full_name").notNull(),
    /** null = no personal phone (BR-06) */
    phoneE164: text("phone_e164"),
    status: text("status", { enum: ["ACTIVE", "INACTIVE", "DECEASED", "TRANSFERRED_OUT"] })
      .notNull()
      .default("ACTIVE"),
    statusReason: text("status_reason"),
    language: text("language", { enum: ["en", "sw"] })
      .notNull()
      .default("sw"),
    sourceRegistrationId: uuid("source_registration_id").references(
      (): AnyPgColumn => registration.id,
    ),
    /** D47: imported from the parish list rather than approved from a registration. */
    importId: uuid("import_id").references(() => memberImport.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    version: integer("version").notNull().default(0),
  },
  (t) => [
    check("member_fwo_number_check", sql`${t.fwoNumber} ~ ${FWO_PATTERN}`),
    check("member_full_name_check", sql`length(btrim(${t.fullName})) BETWEEN 2 AND 120`),
    check("member_phone_e164_check", sql`${t.phoneE164} ~ ${PHONE_E164_PATTERN}`),
    check(
      "member_status_check",
      sql`${t.status} IN ('ACTIVE','INACTIVE','DECEASED','TRANSFERRED_OUT')`,
    ),
    check("member_language_check", sql`${t.language} IN ('en','sw')`),
    check(
      "member_status_reason_check",
      sql`${t.status} = 'ACTIVE' OR ${t.statusReason} IS NOT NULL`,
    ),
    // Approved from a registration or imported, never both.
    check("member_source_check", sql`${t.sourceRegistrationId} IS NULL OR ${t.importId} IS NULL`),
    // D2: an FWO number belongs to one member, forever.
    uniqueIndex("member_fwo_uq").on(t.fwoNumber),
    // D20: one phone number per member. Deceased and transferred members release their
    // number, because Kenyan operators recycle numbers and families inherit phones.
    uniqueIndex("member_phone_uq")
      .on(t.phoneE164)
      .where(sql`${t.phoneE164} IS NOT NULL AND ${t.status} IN ('ACTIVE','INACTIVE')`),
  ],
);

// The exclusion constraint against overlapping periods is in a custom SQL migration.
export const memberHbcAssignment = pgTable(
  "member_hbc_assignment",
  {
    id: id(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id),
    hbcId: uuid("hbc_id")
      .notNull()
      .references(() => hbc.id),
    validFrom: tz("valid_from").notNull().defaultNow(),
    validTo: tz("valid_to"),
  },
  (t) => [
    check(
      "member_hbc_assignment_period_check",
      sql`${t.validTo} IS NULL OR ${t.validTo} > ${t.validFrom}`,
    ),
    uniqueIndex("member_hbc_one_open_uq")
      .on(t.memberId)
      .where(sql`${t.validTo} IS NULL`),
    index("member_hbc_by_hbc_idx")
      .on(t.hbcId)
      .where(sql`${t.validTo} IS NULL`),
  ],
);

// The exclusion constraint against overlapping periods is in a custom SQL migration.
export const departmentMembership = pgTable(
  "department_membership",
  {
    id: id(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => member.id),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => department.id),
    state: text("state", { enum: ["DECLARED", "CONFIRMED"] }).notNull(),
    validFrom: tz("valid_from").notNull().defaultNow(),
    validTo: tz("valid_to"),
    confirmedByUserId: text("confirmed_by_user_id"),
    confirmedAt: tz("confirmed_at"),
  },
  (t) => [
    check("department_membership_state_check", sql`${t.state} IN ('DECLARED','CONFIRMED')`),
    check(
      "department_membership_period_check",
      sql`${t.validTo} IS NULL OR ${t.validTo} > ${t.validFrom}`,
    ),
    check(
      "department_membership_confirmed_check",
      sql`(${t.state} = 'CONFIRMED') = (${t.confirmedAt} IS NOT NULL AND ${t.confirmedByUserId} IS NOT NULL)`,
    ),
  ],
);
