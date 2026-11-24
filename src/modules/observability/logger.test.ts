import { describe, expect, it } from "vitest";
import { createLogger, isLoggerRecord, type LogRecord } from "./logger";

function capture() {
  const lines: LogRecord[] = [];
  const log = createLogger({ requestId: "req-1", sink: (r) => lines.push(r) });
  return { log, lines };
}

describe("createLogger", () => {
  it("writes structured lines with the request id", () => {
    const { log, lines } = capture();
    log.info("registration.submitted", { channel: "SELF", count: 1 });
    expect(lines).toEqual([
      {
        level: "info",
        event: "registration.submitted",
        requestId: "req-1",
        channel: "SELF",
        count: 1,
      },
    ]);
    expect(isLoggerRecord(lines[0])).toBe(true);
  });

  it("redacts fields named like personal data and scrubs strings", () => {
    const { log, lines } = capture();
    log.info("otp.sent", {
      phoneE164: "+254712345678",
      fullName: "Test Member",
      fwoNumber: "1234",
      code: "482913",
      otpCode: 482913,
      note: "sent to 0712345678",
    });
    expect(lines[0]).toMatchObject({
      phoneE164: "[redacted]",
      fullName: "[redacted]",
      fwoNumber: "[redacted]",
      code: "[redacted]",
      otpCode: "[redacted]",
      note: "sent to [redacted]",
    });
  });

  it("keeps flags and keys that only contain a denied word inside another word", () => {
    const { log, lines } = capture();
    log.info("otp.verified", { phoneVerified: true, footprint: "small", attempts: 3 });
    expect(lines[0]).toMatchObject({ phoneVerified: true, footprint: "small", attempts: 3 });
  });

  it("logs errors by their safe fields only", () => {
    const { log, lines } = capture();
    log.error("registration.failed", new Error("Test Member +254712345678"), { step: "otp" });
    expect(lines[0]).toMatchObject({ level: "error", errorName: "Error", step: "otp" });
    expect(JSON.stringify(lines)).not.toMatch(/Test Member|712345678/);
  });

  it("rejects objects smuggled in as field values", () => {
    const { log, lines } = capture();
    log.info("x.y", { member: { phone: "+254712345678" } as unknown as string });
    expect(lines[0]?.member).toBe("[redacted]");
  });

  it("replaces event names that could carry data", () => {
    const { log, lines } = capture();
    log.info("member 0712345678 registered");
    expect(lines[0]?.event).toBe("invalid_event_name");
  });

  it("adds child fields", () => {
    const { log, lines } = capture();
    log.child({ module: "registration" }).warn("registration.slow", { ms: 1200 });
    expect(lines).toEqual([
      {
        level: "warn",
        event: "registration.slow",
        requestId: "req-1",
        module: "registration",
        ms: 1200,
      },
    ]);
  });
});
