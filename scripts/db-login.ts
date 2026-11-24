/**
 * Creates a database login, or rotates its password if it already exists
 * (issues #6 and #8, ADR 0002 amendment, database-design.md §4).
 *
 *   DATABASE_URL=<owner connection string> pnpm db:app-login     # ack_app, member of app_runtime
 *   DATABASE_URL=<owner connection string> pnpm db:backup-login  # ack_backup, read-only
 *
 * - `ack_app` is what the application uses (Hyperdrive, local development). It gets exactly the
 *   grants in the migrations, through `app_runtime`.
 * - `ack_backup` is what the nightly backup and the weekly drift check use. It can read every
 *   table (`pg_read_all_data`) and write nothing, so those jobs never hold the owner's password.
 *
 * Neither login owns anything or has any other power; the script refuses to finish otherwise.
 * It prints the login's connection string once, on stdout. Put it in Hyperdrive, a GitHub
 * environment secret or `.env`; never in the repository.
 */
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client, type ClientBase } from "pg";

export const LOGINS = {
  app: { name: "ack_app", memberOf: "app_runtime" },
  backup: { name: "ack_backup", memberOf: "pg_read_all_data" },
} as const;

export type LoginKind = keyof typeof LOGINS;
export const DEFAULT_APP_LOGIN = LOGINS.app.name;

const ROLE_NAME = /^[a-z][a-z0-9_]{2,62}$/;
const MIN_PASSWORD_LENGTH = 32;

export interface LoginCheck {
  created: boolean;
}

/** Creates or updates the login as a member of `memberOf`, then verifies it. Run inside a transaction. */
export async function ensureLogin(
  client: ClientBase,
  name: string,
  password: string,
  memberOf: string,
): Promise<LoginCheck> {
  if (!ROLE_NAME.test(name)) {
    throw new Error(`Invalid role name "${name}": use lowercase letters, digits and _.`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [name]);
  const created = existing.rowCount === 0;

  // format() quotes the names and password inside Postgres; nothing is concatenated here.
  const template = created
    ? "CREATE ROLE %I WITH LOGIN INHERIT NOCREATEDB NOCREATEROLE PASSWORD %L"
    : "ALTER ROLE %I WITH LOGIN PASSWORD %L";
  await execute(client, template, [name, password]);
  await execute(client, "GRANT %I TO %I", [memberOf, name]);

  await verify(client, name, memberOf);
  return { created };
}

/** The application's login: a member of app_runtime. */
export function ensureAppLogin(client: ClientBase, name: string, password: string) {
  return ensureLogin(client, name, password, LOGINS.app.memberOf);
}

async function execute(client: ClientBase, template: string, args: string[]): Promise<void> {
  const params = args.map((_, i) => `$${i + 2}::text`).join(", ");
  const { rows } = await client.query<{ sql: string }>(`SELECT format($1, ${params}) AS sql`, [
    template,
    ...args,
  ]);
  await client.query(rows[0]!.sql);
}

/** The login must be an ordinary member of `memberOf`: no superpowers, owning nothing. */
async function verify(client: ClientBase, name: string, memberOf: string): Promise<void> {
  const { rows } = await client.query<{
    super: boolean;
    createrole: boolean;
    createdb: boolean;
    member: boolean;
    owned: number;
  }>(
    `SELECT r.rolsuper AS super, r.rolcreaterole AS createrole, r.rolcreatedb AS createdb,
            pg_has_role(r.oid, $2, 'USAGE') AS member,
            (SELECT count(*)::int FROM pg_class WHERE relowner = r.oid) AS owned
       FROM pg_roles r WHERE r.rolname = $1`,
    [name, memberOf],
  );
  const role = rows[0];
  if (!role) throw new Error(`Role "${name}" was not created.`);
  const problems = [
    role.super && "is a superuser",
    role.createrole && "can create roles",
    role.createdb && "can create databases",
    !role.member && `does not inherit ${memberOf}`,
    role.owned > 0 && `owns ${role.owned} relation(s)`,
  ].filter(Boolean);
  if (problems.length > 0) {
    throw new Error(`Role "${name}" ${problems.join(", ")}. Fix it before anything uses it.`);
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

  const kind = process.argv[2] ?? "app";
  if (!(kind in LOGINS)) throw new Error(`Unknown login "${kind}": use app or backup.`);
  const { name, memberOf } = LOGINS[kind as LoginKind];
  const password = randomBytes(32).toString("base64url");

  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  let created = false;
  try {
    await client.query("BEGIN");
    ({ created } = await ensureLogin(client, name, password, memberOf));
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }

  const loginUrl = new URL(ownerUrl);
  loginUrl.username = name;
  loginUrl.password = password;
  process.stderr.write(
    `${created ? "Created" : "Rotated the password of"} login "${name}" (member of ${memberOf}).\n` +
      "Its connection string is below and is shown only once. Store it in Hyperdrive, a GitHub\n" +
      "secret or .env, never in the repository. Rotating invalidates the previous password.\n",
  );
  process.stdout.write(`${loginUrl.toString()}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
