/**
 * Schema drift check (issue #8, ADR 0003): compares a live database with one built from the
 * committed migrations.
 *
 *   DRIFT_EXPECTED_URL=<fresh database, migrated> DRIFT_ACTUAL_URL=<live database> pnpm db:drift
 *   pnpm db:drift --with-counts   # also compare row counts per table (restore drill)
 *
 * Neither ORM sees our CHECK and exclusion constraints, functions, triggers or grants, so this
 * compares the catalogue directly: tables, columns, constraints, indexes, functions, triggers,
 * table, column and function privileges, row-level security policies, enum types, extensions
 * and the list of applied migrations. Owner names are left out, because they differ between
 * environments.
 *
 * It reads definitions only, never member data. `--with-counts` adds a number per table.
 * Exits 1 and prints the differences if the databases differ.
 */
import { fileURLToPath } from "node:url";
import { Client, type ClientBase } from "pg";

const SCHEMA = "public";

/** One sorted line per schema object; equal arrays mean equal schemas. */
export async function schemaSnapshot(client: ClientBase): Promise<string[]> {
  const queries: [string, string][] = [
    [
      "column",
      `SELECT table_name || '.' || column_name || ' ' || data_type || ' ' || udt_name
              || ' null=' || is_nullable || ' default=' || coalesce(column_default, '-')
              || ' generated=' || coalesce(generation_expression, '-')
         FROM information_schema.columns WHERE table_schema = $1`,
    ],
    [
      "relation",
      `SELECT c.relname || ' kind=' || c.relkind::text || ' rls=' || c.relrowsecurity
         FROM pg_class c WHERE c.relnamespace = $1::regnamespace AND c.relkind IN ('r','p','v','m','S')`,
    ],
    [
      "constraint",
      `SELECT conrelid::regclass::text || ' ' || conname || ' ' || pg_get_constraintdef(oid)
         FROM pg_constraint WHERE connamespace = $1::regnamespace`,
    ],
    ["index", `SELECT indexname || ' ' || indexdef FROM pg_indexes WHERE schemaname = $1`],
    [
      "function",
      `SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') definer='
              || p.prosecdef || ' md5=' || md5(pg_get_functiondef(p.oid))
         FROM pg_proc p WHERE p.pronamespace = $1::regnamespace AND p.prokind IN ('f','p')`,
    ],
    [
      "trigger",
      `SELECT tgrelid::regclass::text || ' ' || tgname || ' ' || pg_get_triggerdef(t.oid)
         FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
        WHERE NOT t.tgisinternal AND c.relnamespace = $1::regnamespace`,
    ],
    [
      "grant",
      `SELECT c.relname || ' ' || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
              || ' ' || a.privilege_type
         FROM pg_class c, aclexplode(c.relacl) a
        WHERE c.relnamespace = $1::regnamespace AND a.grantee <> c.relowner`,
    ],
    [
      "column-grant",
      `SELECT c.relname || '.' || at.attname || ' '
              || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
              || ' ' || a.privilege_type
         FROM pg_attribute at JOIN pg_class c ON c.oid = at.attrelid, aclexplode(at.attacl) a
        WHERE c.relnamespace = $1::regnamespace AND a.grantee <> c.relowner`,
    ],
    [
      "function-grant",
      `SELECT p.proname || ' ' || CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END
              || ' ' || a.privilege_type
         FROM pg_proc p, aclexplode(p.proacl) a
        WHERE p.pronamespace = $1::regnamespace AND a.grantee <> p.proowner`,
    ],
    [
      "policy",
      `SELECT tablename || ' ' || policyname || ' ' || cmd || ' ' || array_to_string(roles, ',')
              || ' using=' || coalesce(qual, '-') || ' check=' || coalesce(with_check, '-')
         FROM pg_policies WHERE schemaname = $1`,
    ],
    [
      "enum",
      `SELECT t.typname || ' ' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
         FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typnamespace = $1::regnamespace GROUP BY t.typname`,
    ],
    [
      "extension",
      `SELECT extname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
        WHERE n.nspname = $1`,
    ],
  ];

  const lines: string[] = [];
  for (const [kind, sql] of queries) {
    const { rows } = await client.query<{ line: string }>(`SELECT line FROM (${sql}) AS q(line)`, [
      SCHEMA,
    ]);
    for (const row of rows) lines.push(`${kind} ${row.line}`);
  }

  const migrations = await client
    .query<{ hash: string }>(`SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at`)
    .catch(() => ({ rows: [] as { hash: string }[] }));
  if (migrations.rows.length === 0) lines.push("migration none applied");
  migrations.rows.forEach((row, i) => lines.push(`migration ${i + 1} ${row.hash}`));

  return lines.sort();
}

/** Row counts per table in the schema: numbers only, never row contents. */
export async function rowCounts(client: ClientBase): Promise<string[]> {
  const { rows: tables } = await client.query<{ name: string }>(
    `SELECT quote_ident(relname) AS name FROM pg_class
      WHERE relnamespace = $1::regnamespace AND relkind IN ('r','p') ORDER BY relname`,
    [SCHEMA],
  );
  const lines: string[] = [];
  for (const { name } of tables) {
    const { rows } = await client.query<{ n: string }>(`SELECT count(*) AS n FROM ${name}`);
    lines.push(`rows ${name} ${rows[0]!.n}`);
  }
  return lines;
}

export interface Drift {
  missing: string[];
  unexpected: string[];
}

/** Lines in `expected` but not `actual` are missing; the reverse are unexpected. */
export function compare(expected: string[], actual: string[]): Drift {
  const have = new Set(actual);
  const want = new Set(expected);
  return {
    missing: expected.filter((line) => !have.has(line)),
    unexpected: actual.filter((line) => !want.has(line)),
  };
}

async function capture(url: string, withCounts: boolean): Promise<string[]> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("SET default_transaction_read_only = on");
    const lines = await schemaSnapshot(client);
    return withCounts ? [...lines, ...(await rowCounts(client))] : lines;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const expectedUrl = process.env.DRIFT_EXPECTED_URL;
  const actualUrl = process.env.DRIFT_ACTUAL_URL;
  if (!expectedUrl || !actualUrl) {
    throw new Error("Set DRIFT_EXPECTED_URL (migrated reference) and DRIFT_ACTUAL_URL (live).");
  }
  const withCounts = process.argv.includes("--with-counts");
  const [expected, actual] = await Promise.all([
    capture(expectedUrl, withCounts),
    capture(actualUrl, withCounts),
  ]);
  const { missing, unexpected } = compare(expected, actual);

  if (missing.length === 0 && unexpected.length === 0) {
    process.stdout.write(`No drift: ${expected.length} objects match.\n`);
    return;
  }
  process.stdout.write("Schema drift found.\n");
  for (const line of missing) process.stdout.write(`  missing in live:    ${line}\n`);
  for (const line of unexpected) process.stdout.write(`  unexpected in live: ${line}\n`);
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
