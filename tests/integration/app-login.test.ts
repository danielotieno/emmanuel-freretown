import { describe, expect, it } from "vitest";
import { ensureAppLogin } from "../../scripts/db-app-login";
import { connectTestDb } from "./db";

// The app's database login (issue #6). Each test runs in a transaction that is rolled back,
// and CREATE ROLE is transactional, so no role outlives the test.

const db = connectTestDb();
const NAME = "ack_app_itest";
const PASSWORD = "a".repeat(40);

async function role(name: string) {
  const { rows } = await db.query<{
    login: boolean;
    super: boolean;
    createrole: boolean;
    createdb: boolean;
    member: boolean;
  }>(
    `SELECT rolcanlogin AS login, rolsuper AS super, rolcreaterole AS createrole,
            rolcreatedb AS createdb, pg_has_role(oid, 'app_runtime', 'USAGE') AS member
       FROM pg_roles WHERE rolname = $1`,
    [name],
  );
  return rows[0];
}

describe("ensureAppLogin", () => {
  it("creates a login that inherits app_runtime and has no other powers", async () => {
    const result = await ensureAppLogin(db, NAME, PASSWORD);
    expect(result.created).toBe(true);
    expect(await role(NAME)).toEqual({
      login: true,
      super: false,
      createrole: false,
      createdb: false,
      member: true,
    });
  });

  it("rotates the password when the login already exists", async () => {
    await ensureAppLogin(db, NAME, PASSWORD);
    const again = await ensureAppLogin(db, NAME, "b".repeat(40));
    expect(again.created).toBe(false);
    expect((await role(NAME))?.member).toBe(true);
  });

  it("gets the application's grants and not the owner's", async () => {
    await ensureAppLogin(db, NAME, PASSWORD);
    const { rows } = await db.query<{ read: boolean; update: boolean }>(
      `SELECT has_table_privilege($1, 'member', 'SELECT') AS read,
              has_table_privilege($1, 'audit_entry', 'UPDATE') AS update`,
      [NAME],
    );
    // Reads members through app_runtime; cannot rewrite the append-only audit log.
    expect(rows[0]).toEqual({ read: true, update: false });
  });

  it("rejects unsafe role names and short passwords", async () => {
    await expect(ensureAppLogin(db, "Robert'); DROP TABLE member;--", PASSWORD)).rejects.toThrow(
      /Invalid role name/,
    );
    await expect(ensureAppLogin(db, NAME, "short")).rejects.toThrow(/at least 32/);
  });
});
