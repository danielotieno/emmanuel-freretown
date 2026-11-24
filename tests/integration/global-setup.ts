import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { testDatabaseUrl } from "./env";

/** Wipes the test database and applies every committed migration, as production would. */
export default async function setup() {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS drizzle CASCADE");
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    await migrate(drizzle(client), { migrationsFolder: "src/db/migrations" });
    await allowTestsToAssumeRoles(client);
  } finally {
    await client.end();
  }
}

/**
 * Privilege tests run `SET LOCAL ROLE app_runtime`. A superuser can always do that. On
 * PostgreSQL 16+ (Neon) the migrating role creates these roles with ADMIN but not SET, so grant
 * SET explicitly. Test databases only; production never needs this.
 */
async function allowTestsToAssumeRoles(client: Client) {
  const { rows } = await client.query<{ superuser: boolean; version: number }>(
    "SELECT rolsuper AS superuser, current_setting('server_version_num')::int AS version FROM pg_roles WHERE rolname = current_user",
  );
  const me = rows[0];
  if (!me || me.superuser || me.version < 160000) return;
  for (const role of ["app_runtime", "readonly_ops"]) {
    await client.query(`GRANT ${role} TO CURRENT_USER WITH INHERIT FALSE, SET TRUE`);
  }
}
