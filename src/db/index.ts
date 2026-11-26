import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { createLogger, safeErrorFields } from "../modules/observability";

const logger = createLogger();

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

  // Closing the pool closes each connection's socket. On Workers, Cloudflare's socket then
  // rejects its pending read with a TypeError, which pg passes on as an 'error' event (while
  // ending it ignores only ECONNRESET and EPIPE). By then the pool has stopped listening to the
  // client, so with no listener the error became an unhandled rejection on every request. A
  // client error never loses anything: a query in progress is rejected with it (and reported
  // through safeQuery), and an idle client's error also reaches the pool's 'error' below.
  pool.on("connect", (client) => client.on("error", () => undefined));
  // An idle connection that fails between queries: the pool drops it and opens a new one for
  // the next query. Worth knowing about, not an error for this request. While closing, the
  // same TypeError reaches here too (the pool keeps listening to idle clients as it ends
  // them), and that one is expected.
  let closing = false;
  pool.on("error", (error) => {
    if (closing) return;
    logger.warn("db.idle_connection_lost", { errorName: safeErrorFields(error).errorName });
  });

  return {
    db: drizzle(pool, { schema }),
    close: () => {
      closing = true;
      return pool.end();
    },
  };
}

export { schema };
export { isUniqueViolation, safeQuery, SafeDatabaseError } from "./errors";
