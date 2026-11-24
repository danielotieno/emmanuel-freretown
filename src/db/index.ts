import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

/** A transaction handle, so module functions can run inside a caller's transaction. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Either a database or an open transaction. Module functions accept this. */
export type DbOrTx = Database | Transaction;

export interface DbHandle {
  db: Database;
  close: () => Promise<void>;
}

/**
 * Creates a database handle. On Cloudflare Workers the connection string comes from
 * Hyperdrive and a new handle is created per request; it must be closed when the request ends.
 */
export function createDb(connectionString: string): DbHandle {
  const pool = new Pool({ connectionString, max: 5 });
  return {
    db: drizzle(pool, { schema }),
    close: () => pool.end(),
  };
}

export { schema };
export {
  isUniqueViolation,
  safeQuery,
  SafeDatabaseError,
  toSafeDatabaseError,
  type DatabaseErrorKind,
} from "./errors";
