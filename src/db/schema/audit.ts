import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { tz } from "./columns";

/** Append-only. app_runtime has no UPDATE or DELETE on this table (FR-11). */
export const auditEntry = pgTable(
  "audit_entry",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    at: tz("at").notNull().defaultNow(),
    actorType: text("actor_type", { enum: ["STAFF", "PUBLIC", "SYSTEM"] }).notNull(),
    actorId: text("actor_id"),
    /** e.g. 'registration.approve' */
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    requestId: text("request_id"),
    redactedAt: tz("redacted_at"),
  },
  (t) => [
    check("audit_entry_actor_type_check", sql`${t.actorType} IN ('STAFF','PUBLIC','SYSTEM')`),
    index("audit_entry_entity_idx").on(t.entityType, t.entityId, t.at),
    index("audit_entry_actor_idx").on(t.actorId, t.at),
  ],
);
