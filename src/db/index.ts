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

  // A connection that's checked out (mid-query or in a transaction) has no pool listener. If
  // its socket fails (Hyperdrive drops it, say), pg emits 'error' on the client, and with no
  // listener that throws inside pg-cloudflare's socket reader as an unhandled rejection. This
  // listener only stops the throw: the query in progress is still rejected with the error (and
  // reported through safeQuery), and the pool discards the broken client when it's released.
  pool.on("connect", (client) => client.on("error", () => undefined));

  // An idle connection's error reaches the pool through its idle listener. Without a listener
  // here the pool's emit threw, and that was the unhandled rejection on every request (#94):
  // closing the pool closes each idle socket, Cloudflare's socket rejects its pending read
  // with a TypeError, and pg passes it on (while ending it ignores only ECONNRESET and EPIPE).
  // pg-pool keeps listening to idle clients as it ends them, so after close() this is expected
  // and ignored. Before close() it means a connection was lost between queries: the pool opens
  // a new one for the next query. Logged by error type only (never the message; the field isn't
  // called errorName because the logger redacts any key with "name" in it), without a
  // request id: the handle is created before it knows one, and the warning is rare.
  let closing = false;
  pool.on("error", (error) => {
    if (closing) return;
    logger.warn("db.idle_connection_lost", { errorType: safeErrorFields(error).errorName });
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
