import { redactExpiredRegistrations } from "../modules/audit";
import {
  checkSmsBalance,
  purgeOldSms,
  smsProviderFromEnv,
  sweepPendingSms,
  type JobQueue,
} from "../modules/notifications";
import { SafeError, type Logger } from "../modules/observability";
import { purgeExpiredChallenges, purgeExpiredRateLimits } from "../modules/verification";
import type { Database, DbHandle } from "../db";

/**
 * What a job reports: counts such as `{ deleted: 3 }`, plus safe codes such as a SQLSTATE.
 * A non-zero `failed` marks the job as partly failed. Never personal data.
 */
export type JobResult = Record<string, number | string>;

/** What a job may need besides the database: the Worker's env (secrets) and the job queue. */
export interface JobContext {
  env: Record<string, unknown>;
  jobs: JobQueue;
}

export interface DailyJob {
  /** The job's name in database-design.md §6, e.g. "otp.purge". */
  name: string;
  run(db: Database, ctx: JobContext): Promise<JobResult>;
}

/**
 * The daily housekeeping jobs (database-design.md §6), run once a day by the Cron Trigger so
 * that Neon can scale to zero the rest of the time.
 */
export const DAILY_JOBS: DailyJob[] = [
  { name: "otp.purge", run: async (db) => ({ deleted: await purgeExpiredChallenges(db) }) },
  { name: "ratelimit.purge", run: async (db) => ({ deleted: await purgeExpiredRateLimits(db) }) },
  { name: "sms.sweep", run: async (db, ctx) => sweepPendingSms(db, ctx.jobs) },
  { name: "sms.purge", run: async (db) => ({ deleted: await purgeOldSms(db) }) },
  {
    name: "sms.balance",
    run: async (db, ctx) => checkSmsBalance(db, smsProviderFromEnv(ctx.env)),
  },
  {
    name: "retention.redact",
    run: async (db): Promise<JobResult> => {
      const { redacted, failed, firstFailure } = await redactExpiredRegistrations(db);
      return firstFailure ? { redacted, failed, firstFailure } : { redacted, failed };
    },
  },
];

export interface RunDeps {
  /** Opens a database handle. Each job gets its own, closed when the job ends. */
  openDb: () => DbHandle;
  log: Logger;
  /** Reports a failure to Sentry (reportError from the observability module). */
  report: (error: unknown, tags: Record<string, string>) => void;
  ctx: JobContext;
}

/**
 * Runs every job in turn. A job that fails, or partly fails, is logged and reported to Sentry,
 * and the rest still run. Returns the names of the jobs that failed.
 */
export async function runDailyJobs(jobs: DailyJob[], deps: RunDeps): Promise<string[]> {
  const failed: string[] = [];
  for (const job of jobs) {
    const started = Date.now();
    let handle: DbHandle | undefined;
    try {
      handle = deps.openDb();
      const result = await job.run(handle.db, deps.ctx);
      const ms = Date.now() - started;
      if (typeof result.failed === "number" && result.failed > 0) {
        failed.push(job.name);
        deps.log.warn("job.partly_failed", { job: job.name, ms, ...result });
        // A retention duty that fails every night must not live only in short-lived logs.
        deps.report(new SafeError("job_partly_failed", "A daily job partly failed"), {
          job: job.name,
          ...(typeof result.firstFailure === "string" ? { firstFailure: result.firstFailure } : {}),
        });
      } else {
        deps.log.info("job.completed", { job: job.name, ms, ...result });
      }
    } catch (error) {
      failed.push(job.name);
      deps.log.error("job.failed", error, { job: job.name, ms: Date.now() - started });
      deps.report(error, { job: job.name });
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }
  return failed;
}
