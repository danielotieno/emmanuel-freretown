import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, FWO_PATTERN, id, PHONE_E164_PATTERN, tz, updatedAt } from "./columns";
import { member } from "./membership";
import { department, hbc } from "./organisation";

export const REGISTRATION_STATUSES = [
  "SUBMITTED",
  "CORRECTION_REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export const registration = pgTable(
  "registration",
  {
    id: id(),
    reference: text("reference").notNull(),
    channel: text("channel", { enum: ["SELF", "ASSISTED"] }).notNull(),
    status: text("status", { enum: REGISTRATION_STATUSES }).notNull().default("SUBMITTED"),
    language: text("language", { enum: ["en", "sw"] }).notNull(),
    currentRevisionNo: integer("current_revision_no").notNull().default(1),
    capturedByUserId: text("captured_by_user_id"),
    eventLabel: text("event_label"),
    fwoConflict: boolean("fwo_conflict").notNull().default(false),
    /** BR-06 */
    phoneConflict: boolean("phone_conflict").notNull().default(false),
    memberId: uuid("member_id").references((): AnyPgColumn => member.id),
    decidedAt: tz("decided_at"),
    personalDataRedactedAt: tz("personal_data_redacted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    /** Optimistic concurrency for review actions. */
    version: integer("version").notNull().default(0),
  },
  (t) => [
    check("registration_reference_check", sql`${t.reference} ~ '^REG-[2-9A-HJ-NP-Z]{5}$'`),
    check("registration_channel_check", sql`${t.channel} IN ('SELF','ASSISTED')`),
    check(
      "registration_status_check",
      sql`${t.status} IN ('SUBMITTED','CORRECTION_REQUESTED','APPROVED','REJECTED','WITHDRAWN')`,
    ),
    check("registration_language_check", sql`${t.language} IN ('en','sw')`),
    check(
      "registration_captured_by_check",
      sql`(${t.channel} = 'ASSISTED') = (${t.capturedByUserId} IS NOT NULL)`,
    ),
    check(
      "registration_member_check",
      sql`(${t.status} = 'APPROVED') = (${t.memberId} IS NOT NULL)`,
    ),
    check(
      "registration_decided_check",
      sql`(${t.status} IN ('APPROVED','REJECTED','WITHDRAWN')) = (${t.decidedAt} IS NOT NULL)`,
    ),
    check(
      "registration_redaction_check",
      sql`${t.personalDataRedactedAt} IS NULL OR ${t.status} IN ('REJECTED','WITHDRAWN')`,
    ),
    uniqueIndex("registration_reference_uq").on(t.reference),
    index("registration_queue_idx").on(t.status, t.createdAt),
  ],
);

/** Immutable snapshot of a registration's details (BR-09). Only retention redaction changes it. */
export const registrationRevision = pgTable(
  "registration_revision",
  {
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registration.id),
    revisionNo: integer("revision_no").notNull(),
    fullName: text("full_name"),
    fwoNumber: text("fwo_number"),
    phoneE164: text("phone_e164"),
    hbcId: uuid("hbc_id").references(() => hbc.id),
    adultDeclared: boolean("adult_declared").notNull(),
    /** BR-15 */
    transferConsent: boolean("transfer_consent").notNull(),
    /** BR-16 */
    isNewMember: boolean("is_new_member").notNull().default(false),
    /** BR-06, assisted only */
    noPersonalPhone: boolean("no_personal_phone").notNull().default(false),
    privacyNoticeVersion: text("privacy_notice_version").notNull(),
    /** null for self-registration */
    submittedByUserId: text("submitted_by_user_id"),
    submittedAt: tz("submitted_at").notNull().defaultNow(),
    redactedAt: tz("redacted_at"),
  },
  (t) => [
    primaryKey({ columns: [t.registrationId, t.revisionNo] }),
    check("registration_revision_revision_no_check", sql`${t.revisionNo} >= 1`),
    check(
      "registration_revision_full_name_check",
      sql`${t.fullName} IS NULL OR length(btrim(${t.fullName})) BETWEEN 2 AND 120`,
    ),
    check(
      "registration_revision_fwo_number_check",
      sql`${t.fwoNumber} IS NULL OR ${t.fwoNumber} ~ ${FWO_PATTERN}`,
    ),
    check(
      "registration_revision_phone_e164_check",
      sql`${t.phoneE164} IS NULL OR ${t.phoneE164} ~ ${PHONE_E164_PATTERN}`,
    ),
    check("registration_revision_adult_declared_check", sql`${t.adultDeclared}`),
    check("registration_revision_transfer_consent_check", sql`${t.transferConsent}`),
    check(
      "registration_revision_no_phone_check",
      sql`NOT (${t.noPersonalPhone} AND ${t.phoneE164} IS NOT NULL)`,
    ),
    // Only officers record "No personal phone".
    check(
      "registration_revision_no_phone_officer_check",
      sql`NOT ${t.noPersonalPhone} OR ${t.submittedByUserId} IS NOT NULL`,
    ),
    check(
      "registration_revision_complete_check",
      sql`${t.redactedAt} IS NOT NULL OR
         (${t.fullName} IS NOT NULL AND ${t.hbcId} IS NOT NULL
          AND (${t.phoneE164} IS NOT NULL OR ${t.noPersonalPhone})
          AND (${t.fwoNumber} IS NOT NULL OR ${t.isNewMember}))`,
    ),
    index("registration_revision_fwo_idx").on(t.fwoNumber),
  ],
);

export const registrationRevisionDepartment = pgTable(
  "registration_revision_department",
  {
    registrationId: uuid("registration_id").notNull(),
    revisionNo: integer("revision_no").notNull(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => department.id),
  },
  (t) => [
    primaryKey({ columns: [t.registrationId, t.revisionNo, t.departmentId] }),
    foreignKey({
      name: "registration_revision_department_revision_fk",
      columns: [t.registrationId, t.revisionNo],
      foreignColumns: [registrationRevision.registrationId, registrationRevision.revisionNo],
    }),
  ],
);

export const registrationDecision = pgTable(
  "registration_decision",
  {
    id: id(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registration.id),
    action: text("action", {
      enum: ["APPROVE", "REJECT", "REQUEST_CORRECTION", "WITHDRAW"],
    }).notNull(),
    reason: text("reason"),
    actorUserId: text("actor_user_id").notNull(),
    at: tz("at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "registration_decision_action_check",
      sql`${t.action} IN ('APPROVE','REJECT','REQUEST_CORRECTION','WITHDRAW')`,
    ),
    check(
      "registration_decision_reason_check",
      sql`${t.action} = 'APPROVE' OR ${t.reason} IS NOT NULL`,
    ),
    index("registration_decision_reg_idx").on(t.registrationId, t.at),
  ],
);

/**
 * D30: the highest FWO number ever issued, recorded once by the Church Secretary and raised
 * whenever a higher one is issued (#101). One row.
 */
export const fwoSetting = pgTable(
  "fwo_setting",
  {
    id: id(),
    singleton: boolean("singleton").notNull().default(true),
    highestIssued: text("highest_issued").notNull(),
    updatedAt: updatedAt(),
    updatedByUserId: text("updated_by_user_id").notNull(),
  },
  (t) => [
    check("fwo_setting_singleton_check", sql`${t.singleton}`),
    uniqueIndex("fwo_setting_singleton_uq").on(t.singleton),
    check("fwo_setting_highest_issued_check", sql`${t.highestIssued} ~ ${FWO_PATTERN}`),
  ],
);
