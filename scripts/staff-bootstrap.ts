/**
 * Creates the first Super Administrator (issue #17, FR-10, database-design.md §5: staff users
 * are never seeded from the repository). Run once per environment, on a trusted machine, with
 * the owner's connection string:
 *
 *   DATABASE_URL=<owner connection string> pnpm staff:bootstrap --email <address> --name "<name>"
 *
 * It asks twice for a password (not shown on screen; at least 12 characters), then creates the
 * staff user, their password login and a GLOBAL Super Administrator grant, with audit entries,
 * in one transaction. It refuses if an active Super Administrator already exists: after the
 * first, Super Administrators create staff in the staff portal.
 *
 * The new Super Administrator then signs in at the admin host and sets up an authenticator app
 * before they can do anything else. Nothing personal is printed or logged.
 */
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { hashPassword } from "better-auth/crypto";
import { Client, type ClientBase } from "pg";

export const MIN_PASSWORD_LENGTH = 12;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 200;

export interface FirstSuperAdmin {
  email: string;
  name: string;
  password: string;
}

/** A Better Auth style id: 32 random characters. */
function newId(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Creates the first Super Administrator. Run inside a transaction (the caller commits).
 * Returns the new staff user's id.
 */
export async function createFirstSuperAdmin(
  client: ClientBase,
  input: FirstSuperAdmin,
): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!EMAIL.test(email)) throw new Error("That email address doesn't look right.");
  if (!name || name.length > MAX_NAME_LENGTH) {
    throw new Error(`The name must be 1 to ${MAX_NAME_LENGTH} characters.`);
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`The password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  // Two people running this at once must not both succeed.
  await client.query("LOCK TABLE role_assignment IN SHARE ROW EXCLUSIVE MODE");
  const existing = await client.query(
    "SELECT 1 FROM role_assignment WHERE role = 'SUPER_ADMIN' AND revoked_at IS NULL LIMIT 1",
  );
  if (existing.rowCount) {
    throw new Error(
      "A Super Administrator already exists. Create further staff in the staff portal.",
    );
  }
  const taken = await client.query('SELECT 1 FROM "user" WHERE email = $1', [email]);
  if (taken.rowCount) throw new Error("A staff user with that email address already exists.");

  const userId = newId();
  const passwordHash = await hashPassword(input.password);

  await client.query(
    `INSERT INTO "user" (id, name, email, email_verified, two_factor_enabled)
     VALUES ($1, $2, $3, false, false)`,
    [userId, name, email],
  );
  // Better Auth's email-and-password login: provider "credential", account id = user id.
  await client.query(
    `INSERT INTO account (id, account_id, provider_id, user_id, password, updated_at)
     VALUES ($1, $2, 'credential', $2, $3, now())`,
    [newId(), userId, passwordHash],
  );
  // There is no earlier staff user to have granted it; the grant names its own holder, and the
  // audit entries below record that the system (this script) made it.
  await client.query(
    `INSERT INTO role_assignment (user_id, role, scope_type, granted_by_user_id)
     VALUES ($1, 'SUPER_ADMIN', 'GLOBAL', $1)`,
    [userId],
  );
  await client.query(
    `INSERT INTO audit_entry (actor_type, actor_id, action, entity_type, entity_id, after)
     VALUES ('SYSTEM', NULL, 'staff_user.create', 'staff_user', $1, '{"source":"bootstrap"}'),
            ('SYSTEM', NULL, 'staff_user.grant_role', 'staff_user', $1,
             '{"role":"SUPER_ADMIN","scope":"GLOBAL"}')`,
    [userId],
  );
  return userId;
}

function argument(flag: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing ${flag}.`);
  return value;
}

/** Reads a line from the terminal without echoing it. */
function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error("Run this in a terminal: it asks for a password.");
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const muted = rl as unknown as { _writeToOutput: (text: string) => void };
    let prompted = false;
    muted._writeToOutput = (text: string) => {
      if (!prompted) process.stdout.write(text);
      prompted = true;
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main(): Promise<void> {
  // Deliberately not read from .env: that holds a development database, and a staff account
  // created there by mistake is easy to miss. The target must be given on purpose.
  const ownerUrl = process.env.DATABASE_URL;
  if (!ownerUrl) {
    throw new Error(
      "DATABASE_URL (the owner connection string) is not set in this shell. Nothing was created.",
    );
  }

  const email = argument("--email");
  const name = argument("--name");
  const target = new URL(ownerUrl);
  process.stderr.write(
    `Creating the first Super Administrator in database "${target.pathname.slice(1)}" on ` +
      `${target.hostname}.\nIf that isn't the database you mean, press Ctrl+C now.\n`,
  );
  const password = await askHidden("Password (at least 12 characters): ");
  if ((await askHidden("Same password again: ")) !== password) {
    throw new Error("The passwords don't match. Nothing was created.");
  }

  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    await createFirstSuperAdmin(client, { email, name, password });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
  process.stderr.write(
    "Created the first Super Administrator. Sign in at the staff portal and set up an\n" +
      "authenticator app; nothing else is available until you do.\n",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
