import { z } from "zod";
import type { Database, DbHandle } from "../db";
import type { Logger } from "../modules/observability";

/**
 * A queue message names a job and the id of the row it works on. Never personal data: the
 * handler reads what it needs from the database (CLAUDE.md rule 2).
 */
export const jobMessage = z.object({
  type: z.string().regex(/^[a-z]+(\.[a-z_]+)+$/),
  id: z.uuid(),
});
export type JobMessage = z.infer<typeof jobMessage>;

/** Does the work for one message. Throw to have the message retried later. */
export type QueueHandler = (id: string, db: Database) => Promise<void>;

/**
 * Handlers by message type. `sms.dispatch` arrives with #14 (send a PENDING outbox row; mark it
 * FAILED after the last attempt).
 */
export const QUEUE_HANDLERS: Record<string, QueueHandler> = {};

/** Seconds before retry number `attempts`: 30 s, 1, 2, 4 and 8 minutes. */
export function retryDelaySeconds(attempts: number): number {
  return Math.min(30 * 2 ** Math.max(attempts - 1, 0), 15 * 60);
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
        deps.log.error("queue.unknown_job", undefined, { job: type, messageId: message.id });
        message.ack();
        continue;
      }
      try {
        await handler(id, handle.db);
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
