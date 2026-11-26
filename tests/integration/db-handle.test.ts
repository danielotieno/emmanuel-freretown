import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb } from "../../src/db";
import { testDatabaseUrl } from "./env";

// The per-request database handle (src/db/index.ts, #94). pg emits 'error' on a client whose
// socket fails, and pg-pool re-emits an idle client's error on the pool. With no listener
// either emit throws, which on Workers surfaced as an unhandled rejection: on every request
// (closing the pool makes Cloudflare's sockets report a TypeError), and whenever a checked-out
// connection is dropped mid-query.

/** The pg pool behind a handle (drizzle keeps it as `$client`). */
const poolOf = (handle: ReturnType<typeof createDb>) =>
  (handle.db as unknown as { $client: Pool }).$client;

/** The structured warnings the logger printed. */
function warnings(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
  return spy.mock.calls.map((call) => call[0] as Record<string, unknown>);
}

const LOST = "db.idle_connection_lost";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createDb", () => {
  it("absorbs connections' errors after close, and reports nothing then", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const handle = createDb(testDatabaseUrl());
    const pool = poolOf(handle);
    const client = await pool.connect();
    client.release();
    await handle.close();

    // What Cloudflare's socket does as it closes: the idle listener re-emits on the pool.
    expect(() => client.emit("error", new TypeError("socket closed"))).not.toThrow();
    expect(() => pool.emit("error", new TypeError("socket closed"), client)).not.toThrow();
    expect(warnings(warn).filter((w) => w.event === LOST)).toEqual([]);
  });

  it("reports an idle connection lost while in use, by error type only", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const handle = createDb(testDatabaseUrl());
    const pool = poolOf(handle);
    const client = await pool.connect();
    client.release();
    try {
      const lost = new Error("connection to +254700000000 lost");
      expect(() => client.emit("error", lost)).not.toThrow();

      const reported = warnings(warn).filter((w) => w.event === LOST);
      expect(reported).toHaveLength(1);
      expect(reported[0]).toMatchObject({ event: LOST, errorType: "Error" });
      expect(JSON.stringify(reported)).not.toContain("+254700000000");

      // The handle still works afterwards.
      const { rows } = await pool.query<{ one: number }>("SELECT 1 AS one");
      expect(rows[0]?.one).toBe(1);
    } finally {
      await handle.close();
    }
  });

  it("keeps a checked-out connection's socket failure from throwing", async () => {
    const handle = createDb(testDatabaseUrl());
    const pool = poolOf(handle);
    // Checked out: pg-pool has removed its idle listener, so only createDb's listener is left.
    const held = await pool.connect();
    try {
      expect(held.listenerCount("error")).toBeGreaterThan(0);
      expect(() => held.emit("error", new TypeError("socket closed"))).not.toThrow();
      held.release(true);
      // The pool gives the next query a fresh connection.
      const { rows } = await pool.query<{ one: number }>("SELECT 1 AS one");
      expect(rows[0]?.one).toBe(1);
    } finally {
      await handle.close();
    }
  });
});
