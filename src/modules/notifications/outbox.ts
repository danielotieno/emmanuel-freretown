import { and, eq, sql } from "drizzle-orm";
import { safeQuery, type DbOrTx, type Transaction } from "../../db";
import { smsOutbox } from "../../db/schema";
import { reportError, SafeError } from "../observability";
import { reserveSms } from "./cap";
import type { SmsProvider } from "./provider";
import { renderOtpSms, renderSms, validateSmsParams, type SmsTemplate } from "./templates";

/** A message is marked FAILED after this many send attempts (issue #14). */
export const MAX_SMS_ATTEMPTS = 5;

/** The queue job that retries a send (src/jobs/queue.ts). Its id is the outbox row's. */
export const SMS_DISPATCH_JOB = "sms.dispatch";

const KENYAN_MOBILE_E164 = /^\+254[17][0-9]{8}$/;

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
  if (!KENYAN_MOBILE_E164.test(sms.phoneE164)) {
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
 * - retry: a temporary failure; try again later
 * - failed: rejected, or out of attempts; now FAILED
 * - paused: today's cap is reached; stays PENDING for the next day (D25)
 * - skipped: not PENDING (already sent, failed, or being sent by someone else)
 */
export type DispatchOutcome = "sent" | "retry" | "failed" | "paused" | "skipped";

/**
 * Sends one PENDING outbox message. The row is locked for the send (SKIP LOCKED: a concurrent
 * dispatcher skips it), so the same message is never sent twice at once. The first attempt
 * counts against the daily cap; retries don't. Only response codes are stored in `last_error`,
 * never provider text.
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
      if (row.attempts === 0 && !(await reserveSms(tx))) return "paused";

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
      const failed = result.outcome === "rejected" || attempts >= MAX_SMS_ATTEMPTS;
      await tx
        .update(smsOutbox)
        .set({ status: failed ? "FAILED" : "PENDING", attempts, lastError: result.code })
        .where(eq(smsOutbox.id, id));
      return failed ? "failed" : "retry";
    }),
  );
}

/** The parts of a Cloudflare Queue producer this module uses. */
export interface JobQueue {
  send(
    message: { type: string; id: string },
    options?: { delaySeconds?: number },
  ): Promise<unknown>;
}

/**
 * Sends an outbox message right after the commit that created it (database-design.md §6,
 * `sms.dispatch`). On a temporary failure, or if the database can't be reached, it queues a
 * retry in 30 seconds; the queue then backs off. Call it after the response, with Next.js
 * `after()`. If even the queue is unreachable, the daily sweep picks the message up.
 */
export async function sendNow(
  db: DbOrTx,
  id: string,
  deps: { provider: SmsProvider; jobs: JobQueue },
): Promise<DispatchOutcome> {
  const outcome = await dispatchSms(db, id, deps.provider).catch((): DispatchOutcome => "retry");
  if (outcome === "retry") {
    await deps.jobs.send({ type: SMS_DISPATCH_JOB, id }, { delaySeconds: 30 });
  }
  return outcome;
}

/**
 * Queues every PENDING message older than 15 minutes (database-design.md §6, `sms.sweep`): the
 * safety net for a lost retry, and how messages paused by yesterday's cap go out. Returns the
 * number queued.
 */
export async function sweepPendingSms(db: DbOrTx, jobs: JobQueue): Promise<number> {
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
  for (const { id } of rows) await jobs.send({ type: SMS_DISPATCH_JOB, id });
  return rows.length;
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
 * no code asks for another, within the rate limits. Pass the challenge id as `trackingId`.
 */
export async function sendOtpSms(
  db: DbOrTx,
  provider: SmsProvider,
  otp: { phoneE164: string; code: string; language: "en" | "sw"; trackingId: string },
): Promise<OtpSendOutcome> {
  if (!KENYAN_MOBILE_E164.test(otp.phoneE164)) {
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
