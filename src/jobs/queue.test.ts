import { describe, expect, it } from "vitest";
import type { Database, DbHandle } from "../db";
import { createLogger, type LogRecord } from "../modules/observability";
import { handleQueueBatch, retryDelaySeconds, type QueueMessage } from "./queue";

const ID = "6f1c2b3a-4d5e-4f70-8123-1234567890ab";

function message(body: unknown, attempts = 1) {
  const outcome: { acked: boolean; retried?: number } = { acked: false };
  const m: QueueMessage = {
    id: "msg-1",
    body,
    attempts,
    ack: () => void (outcome.acked = true),
    retry: (options) => void (outcome.retried = options?.delaySeconds),
  };
  return { m, outcome };
}

function harness() {
  const lines: LogRecord[] = [];
  let opened = 0;
  let closed = 0;
  const deps = {
    openDb: (): DbHandle => {
      opened += 1;
      return {
        db: {} as Database,
        close: async () => {
          closed += 1;
        },
      };
    },
    log: createLogger({ sink: (r) => lines.push(r) }),
    report: () => undefined,
  };
  return { deps, lines, counts: () => ({ opened, closed }) };
}

describe("handleQueueBatch", () => {
  it("runs the handler for a valid message and acknowledges it", async () => {
    const { deps, counts } = harness();
    const seen: string[] = [];
    const { m, outcome } = message({ type: "sms.dispatch", id: ID });
    await handleQueueBatch([m], { "sms.dispatch": async (id) => void seen.push(id) }, deps);
    expect(seen).toEqual([ID]);
    expect(outcome).toEqual({ acked: true });
    expect(counts()).toEqual({ opened: 1, closed: 1 });
  });

  it("retries a failed handler with backoff, without logging the error's message", async () => {
    const { deps, lines } = harness();
    const { m, outcome } = message({ type: "sms.dispatch", id: ID }, 3);
    const failing = async () => {
      throw new Error("provider refused +254712345678");
    };
    await handleQueueBatch([m], { "sms.dispatch": failing }, deps);
    expect(outcome).toEqual({ acked: false, retried: 120 });
    expect(lines[0]).toMatchObject({ event: "queue.job_failed", job: "sms.dispatch", attempts: 3 });
    expect(JSON.stringify(lines)).not.toContain("712345678");
  });

  it("acknowledges and logs a malformed message without logging its body", async () => {
    const { deps, lines } = harness();
    const { m, outcome } = message({ type: "sms.dispatch", phone: "+254712345678" });
    await handleQueueBatch([m], {}, deps);
    expect(outcome).toEqual({ acked: true });
    expect(lines[0]).toMatchObject({ event: "queue.invalid_message", messageId: "msg-1" });
    expect(JSON.stringify(lines)).not.toContain("712345678");
  });

  it("acknowledges a message for a job nobody handles, including prototype names", async () => {
    const { deps, lines } = harness();
    const unknown = message({ type: "sms.dispatch", id: ID });
    const proto = message({ type: "x.constructor", id: ID });
    await handleQueueBatch([unknown.m, proto.m], {}, deps);
    expect(unknown.outcome.acked && proto.outcome.acked).toBe(true);
    expect(lines.map((l) => l.event)).toEqual(["queue.unknown_job", "queue.unknown_job"]);
  });

  it("opens no database for an empty batch", async () => {
    const { deps, counts } = harness();
    await handleQueueBatch([], {}, deps);
    expect(counts()).toEqual({ opened: 0, closed: 0 });
  });
});

describe("retryDelaySeconds", () => {
  it("doubles from 30 seconds and caps at 15 minutes", () => {
    expect([1, 2, 3, 4, 5, 10].map(retryDelaySeconds)).toEqual([30, 60, 120, 240, 480, 900]);
  });
});
