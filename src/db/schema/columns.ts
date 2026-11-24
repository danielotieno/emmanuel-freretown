import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/** uuid primary key with gen_random_uuid() (database-design.md §1). */
export const id = () => uuid("id").primaryKey().defaultRandom();

/** timestamptz, stored in UTC. */
export const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const createdAt = () => tz("created_at").notNull().defaultNow();
export const updatedAt = () => tz("updated_at").notNull().defaultNow();

/** E.164 Kenyan mobile number. */
export const PHONE_E164_PATTERN = sql.raw(`'^\\+254[17][0-9]{8}$'`);
/** FWO numbers: digits only, stored as text (BR-01). */
export const FWO_PATTERN = sql.raw(`'^[0-9]+$'`);
