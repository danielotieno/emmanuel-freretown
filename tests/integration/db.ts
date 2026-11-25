import { TransactionRollbackError } from "drizzle-orm/errors";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, DatabaseError } from "pg";
import { afterAll, beforeAll, beforeEach, afterEach } from "vitest";
import { schema, type Database, type Transaction } from "../../src/db";
import { testDatabaseUrl } from "./env";

/**
 * For module functions that take a Drizzle transaction. One connection per test file, without
 * the per-test BEGIN of `connectTestDb` (Drizzle opens its own transaction); wrap each test's
 * work in `rolledBack` instead.
 */
export function connectTestDrizzle(): Database {
  const client = new Client({ connectionString: testDatabaseUrl() });
  beforeAll(() => client.connect());
  afterAll(() => client.end());
  return drizzle(client, { schema });
}

/**
 * Runs `fn` in a Drizzle transaction that is always rolled back, so tests never see each
 * other's rows. Inside, `tx.transaction(…)` opens a savepoint: use it to test what happens
 * when a transaction fails.
 */
export async function rolledBack(db: Database, fn: (tx: Transaction) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      tx.rollback();
    });
  } catch (error) {
    if (!(error instanceof TransactionRollbackError)) throw error;
  }
}

/**
 * One connection per test file. Each test runs inside a transaction that is rolled back,
 * so tests never see each other's rows.
 */
export function connectTestDb() {
  const client = new Client({ connectionString: testDatabaseUrl() });

  beforeAll(() => client.connect());
  afterAll(() => client.end());
  beforeEach(() => client.query("BEGIN"));
  afterEach(() => client.query("ROLLBACK"));

  return client;
}

/**
 * Runs a statement expected to fail and returns the Postgres error code.
 * Uses a savepoint so the surrounding test transaction stays usable.
 */
export async function pgErrorCode(
  client: Client,
  text: string,
  values: unknown[] = [],
): Promise<string | undefined> {
  await client.query("SAVEPOINT expect_error");
  try {
    await client.query(text, values);
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT expect_error");
    if (error instanceof DatabaseError) return error.code;
    throw error;
  }
  await client.query("RELEASE SAVEPOINT expect_error");
  return undefined;
}

export const PG = {
  uniqueViolation: "23505",
  checkViolation: "23514",
  exclusionViolation: "23P01",
  insufficientPrivilege: "42501",
  raiseException: "P0001",
} as const;
