import { and, eq, sql } from "drizzle-orm";
import { safeQuery, type DbHandle, type DbOrTx, type Transaction } from "../../db";
import { PHONE_E164_REGEX, smsOutbox } from "../../db/schema";
import { reportError, SafeError } from "../observability";
import { reserveSms } from "./cap";
import type { SmsProvider } from "./provider";
import { renderOtpSms, renderSms, validateSmsParams, type SmsTemplate } from "./templates";

/** The queue job that retries a send (src/jobs/queue.ts). Its id is the outbox row's. */
export const SMS_DISPATCH_JOB = "sms.dispatch";

export interface OutboxSms {
  phoneE164: string;
  template: SmsTemplate;
  language: "en" | "sw";
  /** The template's parameters: the reference only (FR-8). */
  params: unknown;
}

/**
 * Adds an SMS to the outbox inside the caller's transaction (FR-8), so it exists exactly when
 * the change it reports commits: a provider outage never loses it or fails the registration.
 * Send it after the commit with `sendNow`. Returns the outbox row's id.
 */
export async function enqueueSms(tx: Transaction, sms: OutboxSms): Promise<string> {
  if (!PHONE_E164_REGEX.test(sms.phoneE164)) {
    throw new SafeError("invalid_sms_phone", "SMS go to Kenyan mobile numbers only");
  }
  const params = validateSmsParams(sms.template, sms.params);
  const [row] = await safeQuery(() =>
    tx
      .insert(smsOutbox)
      .values({
        phoneE164: sms.phoneE164,
        template: sms.template,
        language: sms.language,
        params,
      })
      .returning({ id: smsOutbox.id }),
  );
  return row!.id;
}

/**
 * - sent: accepted by the provider (or already sent: a duplicate), now SENT
 * - retry: not sent this time (outage, timeout, account problem); stays PENDING
 * - failed: the provider rejected the request; now FAILED
 * - paused: today's cap is reached; stays PENDING for the next day (D25)
 * - skipped: not PENDING (already sent, failed, or being sent by someone else)
 */
export type DispatchOutcome = "sent" | "retry" | "failed" | "paused" | "skipped";

/**
 * Sends one PENDING outbox message. The row is locked for the send (SKIP LOCKED: a concurrent
 * dispatcher skips it), so the same message is never sent twice at once. Only response codes
 * are stored in `last_error`, never provider text.
 *
 * A message is never lost to an outage (FR-8): a failure the provider may recover from
 * (timeout, network, 5xx, low balance, token) leaves it PENDING. The queue retries it for a
 * few minutes, then the daily sweep each day, for up to 7 days. FAILED means the provider
 * rejected the request, a delivery report said undeliverable, or 7 days passed.
 *
 * The first attempt counts against the daily cap, outside the send's transaction (`db`, not
 * `tx`): the cap row stays locked until its transaction ends, and holding it across a provider
 * call would make every other SMS wait for that call. If this transaction then fails, the day's
 * count is one too high, never too low. Pass a database, not a transaction.
 */
export async function dispatchSms(
  db: DbOrTx,
  id: string,
  provider: SmsProvider,
): Promise<DispatchOutcome> {
  return safeQuery(() =>
    db.transaction(async (tx): Promise<DispatchOutcome> => {
      const [row] = await tx
        .select()
        .from(smsOutbox)
        .where(and(eq(smsOutbox.id, id), eq(smsOutbox.status, "PENDING")))
        .for("update", { skipLocked: true });
      if (!row) return "skipped";
      if (row.attempts === 0 && !(await reserveSms(db))) return "paused";

      const attempts = row.attempts + 1;
      let text: string;
      try {
        text = renderSms(row.template as SmsTemplate, row.params, row.language);
      } catch {
        // Parameters are checked on enqueue; a row that still can't render never will.
        await tx
          .update(smsOutbox)
          .set({ status: "FAILED", attempts, lastError: "invalid_params" })
          .where(eq(smsOutbox.id, id));
        return "failed";
      }
      const result = await provider.send({ to: row.phoneE164, text, trackingId: row.id });

      if (result.outcome === "accepted" || result.outcome === "duplicate") {
        await tx
          .update(smsOutbox)
          .set({
            status: "SENT",
            attempts,
            sentAt: sql`now()`,
            providerMessageId: result.outcome === "accepted" ? result.messageId : null,
            lastError: result.outcome === "duplicate" ? "0409" : null,
          })
          .where(eq(smsOutbox.id, id));
        return "sent";
      }

      if (result.outcome === "retry" && result.accountProblem) {
        reportError(new SafeError("sms_account_problem", "The SMS provider refused a send"), {
          code: result.code,
        });
      }
      const failed = result.outcome === "rejected";
      await tx
        .update(smsOutbox)
        .set({ status: failed ? "FAILED" : "PENDING", attempts, lastError: result.code })
        .where(eq(smsOutbox.id, id));
      return failed ? "failed" : "retry";
    }),
  );
}

type DispatchJob = { type: string; id: string };

/** The parts of a Cloudflare Queue producer this module uses. */
export interface JobQueue {
  send(message: DispatchJob, options?: { delaySeconds?: number }): Promise<unknown>;
  sendBatch(messages: { body: DispatchJob }[]): Promise<unknown>;
}

/**
 * Sends an outbox message right after the commit that created it (database-design.md §6,
 * `sms.dispatch`). Call it from Next.js `after()`, passing an `openDb` that creates its own
 * handle (`createDb` with the Hyperdrive connection string), not the request's `getDb()`:
 * that handle is closed by another `after()` task, which runs at the same time. It is closed
 * here when the send is done.
 *
 * Anything but a send (a temporary failure, an unexpected error, which is reported to Sentry)
 * queues a retry in 30 seconds; the queue then backs off. If even the queue is unreachable,
 * the daily sweep picks the message up.
 */
export async function sendNow(
  openDb: () => DbHandle,
  id: string,
  deps: { provider: SmsProvider; jobs: JobQueue },
): Promise<DispatchOutcome> {
  let outcome: DispatchOutcome;
  let handle: DbHandle | undefined;
  try {
    handle = openDb();
    outcome = await dispatchSms(handle.db, id, deps.provider);
  } catch (error) {
    reportError(error, { job: SMS_DISPATCH_JOB });
    outcome = "retry";
  } finally {
    await handle?.close().catch(() => undefined);
  }
  if (outcome === "retry") {
    await deps.jobs.send({ type: SMS_DISPATCH_JOB, id }, { delaySeconds: 30 });
  }
  return outcome;
}

/** A PENDING message not sent within this many days is given up on (FAILED, "expired"). */
export const SMS_EXPIRY_DAYS = 7;

/** Cloudflare Queues accepts at most 100 messages per batch. */
const BATCH_SIZE = 100;

/**
 * The daily `sms.sweep` (database-design.md §6). Queues every PENDING message older than 15
 * minutes, by then out of its immediate retries: the safety net for a lost retry, the daily
 * retry after an outage or an account problem, and how messages paused by yesterday's cap go
 * out. Messages PENDING for more than 7 days are marked FAILED ("expired") instead.
 */
export async function sweepPendingSms(
  db: DbOrTx,
  jobs: JobQueue,
): Promise<{ queued: number; expired: number }> {
  const expired = await safeQuery(() =>
    db
      .update(smsOutbox)
      .set({ status: "FAILED", lastError: "expired" })
      .where(
        and(
          eq(smsOutbox.status, "PENDING"),
          sql`${smsOutbox.createdAt} < now() - make_interval(days => ${SMS_EXPIRY_DAYS})`,
        ),
      )
      .returning({ id: smsOutbox.id }),
  );
  const rows = await safeQuery(() =>
    db
      .select({ id: smsOutbox.id })
      .from(smsOutbox)
      .where(
        and(
          eq(smsOutbox.status, "PENDING"),
          sql`${smsOutbox.createdAt} < now() - interval '15 minutes'`,
        ),
      )
      .orderBy(smsOutbox.createdAt),
  );
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await jobs.sendBatch(
      rows.slice(i, i + BATCH_SIZE).map(({ id }) => ({ body: { type: SMS_DISPATCH_JOB, id } })),
    );
  }
  return { queued: rows.length, expired: expired.length };
}

/** Deletes outbox rows older than 90 days (database-design.md §6, `sms.purge`). */
export async function purgeOldSms(db: DbOrTx): Promise<number> {
  return safeQuery(async () => {
    const deleted = await db
      .delete(smsOutbox)
      .where(sql`${smsOutbox.createdAt} < now() - interval '90 days'`)
      .returning({ id: smsOutbox.id });
    return deleted.length;
  });
}

export type OtpSendOutcome = "sent" | "paused" | "failed";

/**
 * Sends an OTP code (FR-2), directly and never through the outbox: the outbox keeps its
 * parameters in the database, and codes are stored only as a hash (rule 8). Counts against the
 * daily cap first; at the cap it sends nothing and returns `paused`, and the caller shows the
 * public the same message as when a code was sent (D25). There is no retry: a member who gets
 * no code asks for another, within the rate limits. Pass the challenge id as `trackingId`, and
 * a database, not a transaction: the cap row is locked until the transaction that counts the
 * SMS ends, and every other SMS would wait for this provider call.
 */
export async function sendOtpSms(
  db: DbOrTx,
  provider: SmsProvider,
  otp: { phoneE164: string; code: string; language: "en" | "sw"; trackingId: string },
): Promise<OtpSendOutcome> {
  if (!PHONE_E164_REGEX.test(otp.phoneE164)) {
    throw new SafeError("invalid_sms_phone", "SMS go to Kenyan mobile numbers only");
  }
  const text = renderOtpSms(otp.code, otp.language);
  if (!(await reserveSms(db))) return "paused";
  const result = await provider.send({ to: otp.phoneE164, text, trackingId: otp.trackingId });
  if (result.outcome === "accepted" || result.outcome === "duplicate") return "sent";
  if (result.outcome === "retry" && result.accountProblem) {
    reportError(new SafeError("sms_account_problem", "The SMS provider refused a send"), {
      code: result.code,
    });
  }
  return "failed";
}
