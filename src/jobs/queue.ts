import { z } from "zod";
import type { Database, DbHandle } from "../db";
import { dispatchSms, SMS_DISPATCH_JOB, smsProviderFromEnv } from "../modules/notifications";
import { SafeError, type Logger } from "../modules/observability";

/**
 * A queue message names a job and the id of the row it works on. Never personal data: the
 * handler reads what it needs from the database (CLAUDE.md rule 2).
 */
export const jobMessage = z.object({
  type: z.string().regex(/^[a-z]+(\.[a-z_]+)+$/),
  id: z.uuid(),
});
export type JobMessage = z.infer<typeof jobMessage>;

/**
 * Deliveries per message: the first plus `max_retries` in wrangler.jsonc (keep the two in step).
 * After the last, Cloudflare drops the message.
 */
export const MAX_ATTEMPTS = 5;

/**
 * Does the work for one message. Throw to have the message retried later. On the last attempt
 * a handler should record the failure itself (e.g. mark an SMS FAILED), because the message
 * won't come back.
 */
export type QueueHandler = (
  id: string,
  db: Database,
  attempt: { number: number; isLast: boolean },
  env: Record<string, unknown>,
) => Promise<void>;

/** Handlers by message type. */
export const QUEUE_HANDLERS: Record<string, QueueHandler> = {
  /**
   * Retries an outbox SMS (#14). The outbox counts attempts itself and marks the message
   * FAILED after the fifth, whichever path made them; a message paused by the daily cap is
   * acknowledged and waits for the next day's sweep.
   */
  [SMS_DISPATCH_JOB]: async (id, db, _attempt, env) => {
    const outcome = await dispatchSms(db, id, smsProviderFromEnv(env));
    if (outcome === "retry") throw new SafeError("sms_retry", "SMS send failed; will retry");
  },
};

/** Seconds to wait after failed attempt number `attempts`: 30 s, then 1, 2 and 4 minutes. */
export function retryDelaySeconds(attempts: number): number {
  return 30 * 2 ** Math.max(attempts - 1, 0);
}

/** The parts of a Cloudflare Queues message this consumer uses. */
export interface QueueMessage {
  readonly id: string;
  readonly body: unknown;
  readonly attempts: number;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

export interface QueueDeps {
  openDb: () => DbHandle;
  /** The Worker's env, for handlers that need a secret. */
  env: Record<string, unknown>;
  log: Logger;
  report: (error: unknown, tags: Record<string, string>) => void;
}

/**
 * Consumes a batch. A malformed message or an unknown type is acknowledged and logged:
 * retrying can't fix it. A handler failure is retried with backoff, up to the consumer's
 * `max_retries` in wrangler.jsonc. One database handle serves the whole batch.
 */
export async function handleQueueBatch(
  messages: readonly QueueMessage[],
  handlers: Record<string, QueueHandler>,
  deps: QueueDeps,
): Promise<void> {
  if (messages.length === 0) return;
  const handle = deps.openDb();
  try {
    for (const message of messages) {
      const parsed = jobMessage.safeParse(message.body);
      if (!parsed.success) {
        deps.log.error("queue.invalid_message", undefined, { messageId: message.id });
        message.ack();
        continue;
      }
      const { type, id } = parsed.data;
      const handler = Object.hasOwn(handlers, type) ? handlers[type] : undefined;
      if (!handler) {
        // Not the type itself: an unknown type is arbitrary text.
        deps.log.error("queue.unknown_job", undefined, { messageId: message.id });
        message.ack();
        continue;
      }
      try {
        await handler(
          id,
          handle.db,
          { number: message.attempts, isLast: message.attempts >= MAX_ATTEMPTS },
          deps.env,
        );
        message.ack();
        deps.log.info("queue.job_completed", { job: type, attempts: message.attempts });
      } catch (error) {
        const delaySeconds = retryDelaySeconds(message.attempts);
        deps.log.error("queue.job_failed", error, {
          job: type,
          attempts: message.attempts,
          delaySeconds,
        });
        deps.report(error, { job: type });
        message.retry({ delaySeconds });
      }
    }
  } finally {
    await handle.close().catch(() => undefined);
  }
}
