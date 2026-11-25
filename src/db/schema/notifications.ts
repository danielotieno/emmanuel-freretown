import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id, PHONE_E164_PATTERN, tz, updatedAt } from "./columns";

/**
 * SMS settings administrators can change (D25): the daily cap and the balance, in SMS units,
 * below which staff are alerted. One row per setting, seeded by migration.
 */
export const smsSetting = pgTable(
  "sms_setting",
  {
    key: text("key", { enum: ["daily_cap", "low_balance_units"] }).primaryKey(),
    value: integer("value").notNull(),
    updatedAt: updatedAt(),
    updatedByUserId: text("updated_by_user_id"),
  },
  (t) => [
    check("sms_setting_key_check", sql`${t.key} IN ('daily_cap','low_balance_units')`),
    check("sms_setting_value_check", sql`${t.value} >= 0`),
  ],
);

/** SMS sent per Africa/Nairobi day, OTP codes included, for the daily cap (D25). */
export const smsDailyUsage = pgTable(
  "sms_daily_usage",
  {
    day: date("day", { mode: "string" }).primaryKey(),
    sent: integer("sent").notNull().default(0),
  },
  (t) => [check("sms_daily_usage_sent_check", sql`${t.sent} >= 0`)],
);

export const smsOutbox = pgTable(
  "sms_outbox",
  {
    id: id(),
    phoneE164: text("phone_e164").notNull(),
    /** e.g. 'registration.submitted' */
    template: text("template").notNull(),
    language: text("language", { enum: ["en", "sw"] }).notNull(),
    /** Reference and status only; never names (FR-8). */
    params: jsonb("params").notNull().default({}),
    status: text("status", { enum: ["PENDING", "SENT", "DELIVERED", "FAILED"] })
      .notNull()
      .default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    providerMessageId: text("provider_message_id"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    sentAt: tz("sent_at"),
    deliveredAt: tz("delivered_at"),
  },
  (t) => [
    check("sms_outbox_phone_e164_check", sql`${t.phoneE164} ~ ${PHONE_E164_PATTERN}`),
    check("sms_outbox_language_check", sql`${t.language} IN ('en','sw')`),
    check("sms_outbox_status_check", sql`${t.status} IN ('PENDING','SENT','DELIVERED','FAILED')`),
    index("sms_outbox_pending_idx")
      .on(t.createdAt)
      .where(sql`${t.status} = 'PENDING'`),
  ],
);
