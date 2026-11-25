import { describe, expect, it } from "vitest";
import type { Database, DbHandle } from "../db";
import { createLogger, type LogRecord } from "../modules/observability";
import { runDailyJobs, type DailyJob, type JobResult, type RunDeps } from "./daily";

function harness() {
  const lines: LogRecord[] = [];
  const reported: unknown[] = [];
  const handles: { closed: boolean }[] = [];
  const openDb = (): DbHandle => {
    const h = { closed: false };
    handles.push(h);
    return {
      db: {} as Database,
      close: async () => {
        h.closed = true;
      },
    };
  };
  const deps: RunDeps = {
    openDb,
    log: createLogger({ sink: (r) => lines.push(r) }),
    report: (error: unknown) => void reported.push(error),
    ctx: { env: {}, jobs: { send: async () => undefined } },
  };
  return { deps, lines, reported, handles };
}

const ok = (name: string, result: JobResult = { deleted: 2 }): DailyJob => ({
  name,
  run: async () => result,
});

describe("runDailyJobs", () => {
  it("runs every job with its own database handle, closing each", async () => {
    const { deps, lines, handles } = harness();
    const failed = await runDailyJobs([ok("a.one"), ok("b.two")], deps);
    expect(failed).toEqual([]);
    expect(handles).toEqual([{ closed: true }, { closed: true }]);
    expect(lines.map((l) => [l.event, l.job, l.deleted])).toEqual([
      ["job.completed", "a.one", 2],
      ["job.completed", "b.two", 2],
    ]);
  });

  it("keeps going after a job throws, logs it safely, reports it and still closes its handle", async () => {
    const { deps, lines, reported, handles } = harness();
    const boom: DailyJob = {
      name: "a.boom",
      run: async () => {
        throw new Error("params: Wanjiku Testperson,+254712345678");
      },
    };
    const failed = await runDailyJobs([boom, ok("b.two")], deps);
    expect(failed).toEqual(["a.boom"]);
    expect(reported).toHaveLength(1);
    expect(handles.every((h) => h.closed)).toBe(true);
    expect(lines[0]).toMatchObject({ level: "error", event: "job.failed", job: "a.boom" });
    expect(lines[1]).toMatchObject({ event: "job.completed", job: "b.two" });
    expect(JSON.stringify(lines)).not.toMatch(/Wanjiku|712345678/);
  });

  it("counts a job that reports failures as failed, and reports it to Sentry", async () => {
    const { deps, lines, reported } = harness();
    const tags: Record<string, string>[] = [];
    deps.report = (_error, t) => void tags.push(t);
    const result = { redacted: 3, failed: 1, firstFailure: "P0001" };
    const failed = await runDailyJobs([ok("r.redact", result)], deps);
    expect(failed).toEqual(["r.redact"]);
    expect(lines[0]).toMatchObject({
      level: "warn",
      event: "job.partly_failed",
      failed: 1,
      firstFailure: "P0001",
    });
    expect(tags).toEqual([{ job: "r.redact", firstFailure: "P0001" }]);
    expect(reported).toHaveLength(0);
  });

  it("treats a database that can't be opened as that job's failure", async () => {
    const { deps } = harness();
    deps.openDb = () => {
      throw new Error("no Hyperdrive");
    };
    expect(await runDailyJobs([ok("a.one")], deps)).toEqual(["a.one"]);
  });
});
