import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { createDb } from "../../src/db";
import { testDatabaseUrl } from "./env";

// The per-request database handle (src/db/index.ts). On Workers, closing the pool makes each
// connection's socket report a TypeError, after the pool has stopped listening to the client.
// Unheard, pg's 'error' event threw and surfaced as an unhandled rejection on every request.

/** The pg pool behind a handle (drizzle keeps it as `$client`). */
const poolOf = (handle: ReturnType<typeof createDb>) =>
  (handle.db as unknown as { $client: Pool }).$client;

describe("createDb", () => {
  it("absorbs a connection's error after the handle is closed", async () => {
    const handle = createDb(testDatabaseUrl());
    const pool = poolOf(handle);
    const client = await pool.connect();
    client.release();
    await handle.close();
    // What Cloudflare's socket does as it closes; with no listener this would throw.
    expect(() => client.emit("error", new TypeError("socket closed"))).not.toThrow();
    expect(() => pool.emit("error", new TypeError("socket closed"), client)).not.toThrow();
  });

  it("keeps a lost idle connection from throwing while the handle is in use", async () => {
    const handle = createDb(testDatabaseUrl());
    const pool = poolOf(handle);
    const client = await pool.connect();
    client.release();
    try {
      expect(() => pool.emit("error", new Error("connection lost"), client)).not.toThrow();
      // The handle still works afterwards.
      const { rows } = await pool.query<{ one: number }>("SELECT 1 AS one");
      expect(rows[0]?.one).toBe(1);
    } finally {
      await handle.close();
    }
  });
});
