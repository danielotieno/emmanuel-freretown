import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";
import { isUniqueViolation, safeQuery, schema } from "../../src/db";
import {
  createLogger,
  installConsoleGuard,
  errorTags,
  scrubEvent,
  type LogRecord,
} from "../../src/modules/observability";
import { connectTestDb } from "./db";

// Issue #9 acceptance test: a unique violation on a phone number must not leak the number into
// any log line or error report. Drizzle puts query parameters in its error message, and
// Postgres puts the conflicting value in `detail`; both are checked against a real database.

const client = connectTestDb();
const db = drizzle(client, { schema });

// Synthetic values (CLAUDE.md). The digits are checked without the prefix as well, so a
// reformatted number (0712…, 254712…) would also be caught.
const PHONE = "+254712345678";
const DIGITS = "712345678";
const NAME = "Wanjiku Testperson";
const LEAKS = new RegExp(`${DIGITS}|${NAME}|99001`);

/** Inserts two members with the same phone number and returns the raw error thrown by Drizzle. */
async function phoneConflict(): Promise<unknown> {
  await db
    .insert(schema.member)
    .values({ fwoNumber: "99000", fullName: "Other Member", phoneE164: PHONE });
  await client.query("SAVEPOINT conflict");
  try {
    await db.insert(schema.member).values({ fwoNumber: "99001", fullName: NAME, phoneE164: PHONE });
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT conflict");
    return error;
  }
  throw new Error("expected a unique violation");
}

describe("a phone number unique violation", () => {
  it("really does carry the phone number in the raw error (so the checks below mean something)", async () => {
    const raw = (await phoneConflict()) as Error & { cause?: { detail?: string } };
    expect(raw.message).toContain(DIGITS);
    expect(raw.message).toContain(NAME);
    expect(raw.cause?.detail).toContain(DIGITS);
  });

  it("is mapped to a safe domain error that names the constraint and nothing else", async () => {
    await client.query("SAVEPOINT safe");
    const error = await safeQuery(() =>
      db.insert(schema.member).values([
        { fwoNumber: "99002", fullName: "Other Member", phoneE164: PHONE },
        { fwoNumber: "99001", fullName: NAME, phoneE164: PHONE },
      ]),
    ).catch((e: unknown) => e);
    await client.query("ROLLBACK TO SAVEPOINT safe");

    expect(isUniqueViolation(error, "member_phone_uq")).toBe(true);
    const e = error as Error;
    expect(`${e.message}\n${e.stack}\n${JSON.stringify(e)}`).not.toMatch(LEAKS);

    // The path a module takes: safeQuery, then a log line and a Sentry report. Both keep the
    // SQLSTATE and constraint that make the failure diagnosable.
    const lines: LogRecord[] = [];
    createLogger({ sink: (r) => lines.push(r) }).error("registration.failed", error);
    expect(lines[0]).toMatchObject({ sqlState: "23505", constraint: "member_phone_uq" });
    expect(errorTags(error)).toMatchObject({ sqlState: "23505", constraint: "member_phone_uq" });
  });

  it("writes no log line containing the phone number, the name or the FWO number", async () => {
    const raw = await phoneConflict();
    const lines: LogRecord[] = [];
    const log = createLogger({ requestId: "itest", sink: (r) => lines.push(r) });

    log.error("registration.failed", raw, { step: "submit" });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ sqlState: "23505", constraint: "member_phone_uq" });
    expect(JSON.stringify(lines)).not.toMatch(LEAKS);
  });

  it("is stripped when something else (Next.js, a library) prints the raw error to the console", async () => {
    const raw = await phoneConflict();
    const printed: unknown[] = [];
    const record = (...args: unknown[]) => void printed.push(args);
    const fake = {
      log: record,
      info: record,
      debug: record,
      warn: record,
      error: record,
      trace: record,
    };
    installConsoleGuard(fake as unknown as Console);

    (fake as unknown as Console).error("Error:", raw);
    (fake as unknown as Console).error(String(raw));

    expect(JSON.stringify(printed)).not.toMatch(LEAKS);
  });

  it("is stripped from a Sentry event", async () => {
    const raw = (await phoneConflict()) as Error & { cause: Error & { detail: string } };
    const event = scrubEvent(
      {
        type: undefined,
        exception: {
          values: [
            { type: raw.cause.name, value: `${raw.cause.message} ${raw.cause.detail}` },
            { type: raw.name, value: raw.message },
          ],
        },
      },
      { originalException: raw },
    );
    expect(JSON.stringify(event)).not.toMatch(LEAKS);
  });
});
