import { sql } from "drizzle-orm";
import { timestamp, uuid } from "drizzle-orm/pg-core";

/** uuid primary key with gen_random_uuid() (database-design.md §1). */
export const id = () => uuid("id").primaryKey().defaultRandom();

/** timestamptz, stored in UTC. */
export const tz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const createdAt = () => tz("created_at").notNull().defaultNow();
export const updatedAt = () => tz("updated_at").notNull().defaultNow();

/**
 * E.164 Kenyan mobile number (BR-06): the one definition, used by the CHECK on every phone
 * column and by the modules' own checks.
 */
export const PHONE_E164_REGEX = /^\+254[17][0-9]{8}$/;
export const PHONE_E164_PATTERN = sql.raw(`'${PHONE_E164_REGEX.source}'`);
/** FWO numbers: digits only, stored as text without leading zeros (BR-01, D61). */
export const FWO_PATTERN = sql.raw(`'^(0|[1-9][0-9]*)$'`);
