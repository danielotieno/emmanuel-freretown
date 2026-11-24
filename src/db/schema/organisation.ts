import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./columns";

export const hbc = pgTable(
  "hbc",
  {
    id: id(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("hbc_name_check", sql`length(btrim(${t.name})) BETWEEN 2 AND 80`),
    uniqueIndex("hbc_name_uq").on(sql`lower(${t.name})`),
  ],
);

export const department = pgTable(
  "department",
  {
    id: id(),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("department_name_check", sql`length(btrim(${t.name})) BETWEEN 2 AND 80`),
    uniqueIndex("department_name_uq").on(sql`lower(${t.name})`),
  ],
);
