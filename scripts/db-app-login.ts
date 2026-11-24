/**
 * Creates the application's database login, or rotates its password if it already exists
 * (issue #6, ADR 0002 amendment, database-design.md §4).
 *
 * The login is a member of `app_runtime` and owns nothing, so the app gets exactly the grants
 * in the migrations and no more. Run it in every environment, local development included, so
 * a missing grant fails locally before it fails in production.
 *
 *   DATABASE_URL=<owner connection string> pnpm db:app-login [role-name]
 *
 * Prints the app's connection string once, on stdout. Put it in Hyperdrive (staging and
 * production) or in `.env` (local); never in the repository.
 */
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client, type ClientBase } from "pg";

export const DEFAULT_APP_LOGIN = "ack_app";
const ROLE_NAME = /^[a-z][a-z0-9_]{2,62}$/;
const MIN_PASSWORD_LENGTH = 32;

export interface AppLoginCheck {
  created: boolean;
}

/** Creates or updates the login and verifies it. Run inside a transaction. */
export async function ensureAppLogin(
  client: ClientBase,
  name: string,
  password: string,
): Promise<AppLoginCheck> {
  if (!ROLE_NAME.test(name)) {
    throw new Error(`Invalid role name "${name}": use lowercase letters, digits and _.`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [name]);
  const created = existing.rowCount === 0;

  // format() quotes the name and password inside Postgres; nothing is concatenated here.
  const template = created
    ? "CREATE ROLE %I WITH LOGIN INHERIT NOCREATEDB NOCREATEROLE PASSWORD %L"
    : "ALTER ROLE %I WITH LOGIN PASSWORD %L";
  await execute(client, template, [name, password]);
  await execute(client, "GRANT app_runtime TO %I", [name]);

  await verify(client, name);
  return { created };
}

async function execute(client: ClientBase, template: string, args: string[]): Promise<void> {
  const params = args.map((_, i) => `$${i + 2}::text`).join(", ");
  const { rows } = await client.query<{ sql: string }>(`SELECT format($1, ${params}) AS sql`, [
    template,
    ...args,
  ]);
  await client.query(rows[0]!.sql);
}

/** The login must be an ordinary member of app_runtime: no superpowers, owning nothing. */
async function verify(client: ClientBase, name: string): Promise<void> {
  const { rows } = await client.query<{
    super: boolean;
    createrole: boolean;
    createdb: boolean;
    member: boolean;
    owned: number;
  }>(
    `SELECT r.rolsuper AS super, r.rolcreaterole AS createrole, r.rolcreatedb AS createdb,
            pg_has_role(r.oid, 'app_runtime', 'USAGE') AS member,
            (SELECT count(*)::int FROM pg_class WHERE relowner = r.oid) AS owned
       FROM pg_roles r WHERE r.rolname = $1`,
    [name],
  );
  const role = rows[0];
  if (!role) throw new Error(`Role "${name}" was not created.`);
  const problems = [
    role.super && "is a superuser",
    role.createrole && "can create roles",
    role.createdb && "can create databases",
    !role.member && "does not inherit app_runtime",
    role.owned > 0 && `owns ${role.owned} relation(s)`,
  ].filter(Boolean);
  if (problems.length > 0) {
    throw new Error(`Role "${name}" ${problems.join(", ")}. Fix it before the app uses it.`);
  }
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // no .env file; the caller sets DATABASE_URL
  }
  const ownerUrl = process.env.DATABASE_URL;
  if (!ownerUrl) throw new Error("DATABASE_URL (the owner connection string) is not set.");

  const name = process.argv[2] ?? DEFAULT_APP_LOGIN;
  const password = randomBytes(32).toString("base64url");

  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  let created = false;
  try {
    await client.query("BEGIN");
    ({ created } = await ensureAppLogin(client, name, password));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  const appUrl = new URL(ownerUrl);
  appUrl.username = name;
  appUrl.password = password;
  process.stderr.write(
    `${created ? "Created" : "Rotated the password of"} login "${name}" (member of app_runtime).\n` +
      "Its connection string is below and is shown only once. Store it in Hyperdrive or .env,\n" +
      "never in the repository. Rotating invalidates the previous password.\n",
  );
  process.stdout.write(`${appUrl.toString()}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
