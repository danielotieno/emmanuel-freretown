import { integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { tz } from "./columns";

/** Keys hash phone numbers and IPs, so this table holds no readable personal data. */
export const rateLimitBucket = pgTable(
  "rate_limit_bucket",
  {
    /** e.g. 'otp:phone:<sha256>' or 'form:ip:<sha256>' */
    key: text("key").notNull(),
    windowStart: tz("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);
