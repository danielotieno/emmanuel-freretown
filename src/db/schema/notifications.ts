import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id, PHONE_E164_PATTERN, tz } from "./columns";

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
