import { sql } from "drizzle-orm";
import { check, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { id, tz } from "./columns";

// The partial unique index with NULLS NOT DISTINCT (one active grant per user, role and
// scope) is in a custom SQL migration: Drizzle cannot express it.
export const roleAssignment = pgTable(
  "role_assignment",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    role: text("role", {
      enum: ["SUPER_ADMIN", "MEMBERSHIP_ADMIN", "REGISTRATION_OFFICER"],
    }).notNull(),
    scopeType: text("scope_type", { enum: ["GLOBAL", "HBC", "DEPARTMENT"] })
      .notNull()
      .default("GLOBAL"),
    scopeId: uuid("scope_id"),
    grantedByUserId: text("granted_by_user_id").notNull(),
    grantedAt: tz("granted_at").notNull().defaultNow(),
    revokedAt: tz("revoked_at"),
  },
  (t) => [
    check(
      "role_assignment_role_check",
      sql`${t.role} IN ('SUPER_ADMIN','MEMBERSHIP_ADMIN','REGISTRATION_OFFICER')`,
    ),
    check("role_assignment_scope_type_check", sql`${t.scopeType} IN ('GLOBAL','HBC','DEPARTMENT')`),
    check("role_assignment_scope_check", sql`(${t.scopeType} = 'GLOBAL') = (${t.scopeId} IS NULL)`),
  ],
);
