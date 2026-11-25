import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { after } from "next/server";
import { cache } from "react";
import { createDb, type Database, type DbHandle } from "@/db";

/**
 * The database for this request, connected through Hyperdrive. Pass it to module
 * functions; never query it from a route or component (CLAUDE.md rule 5).
 * The connection is closed once the response has been sent.
 */
export const getDb = cache(async (): Promise<Database> => {
  const { env } = await getCloudflareContext({ async: true });
  const handle = createDb(env.HYPERDRIVE.connectionString);
  after(() => handle.close());
  return handle.db;
});

/**
 * Opens a database handle of its own, for work after the response such as sending an SMS from
 * `after()`: the request's handle from `getDb()` is closed by another `after()` task that runs at
 * the same time. Whoever opens it closes it.
 */
export async function getDbOpener(): Promise<() => DbHandle> {
  const { env } = await getCloudflareContext({ async: true });
  const connectionString = env.HYPERDRIVE.connectionString;
  return () => createDb(connectionString);
}
