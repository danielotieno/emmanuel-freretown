import { describe, expect, it } from "vitest";
import { installConsoleGuard } from "./console-guard";
import { createLogger } from "./logger";

function guardedConsole() {
  const written: unknown[][] = [];
  const record = (...args: unknown[]) => void written.push(args);
  const target = {
    log: record,
    info: record,
    debug: record,
    warn: record,
    error: record,
    trace: record,
  } as unknown as Console;
  installConsoleGuard(target);
  return { target, written };
}

describe("installConsoleGuard", () => {
  it("reduces errors to safe fields and scrubs strings and objects", () => {
    const { target, written } = guardedConsole();
    target.error(" ⨯", new Error("Failed query: insert ...\nparams: Test Member,+254712345678"));
    target.log("sent to 0712345678", { phoneE164: "+254712345678" });

    expect(JSON.stringify(written)).not.toMatch(/Test Member|712345678/);
    expect(written[0]?.[1]).toMatchObject({ errorName: "Error" });
  });

  it("passes the logger's own lines through unchanged, keeping SQLSTATEs", () => {
    const { target, written } = guardedConsole();
    const pg = Object.assign(new Error("x"), { code: "23505", constraint: "member_phone_uq" });
    createLogger({ sink: (record) => target.error(record) }).error("db.failed", pg);
    expect(written[0]?.[0]).toMatchObject({ sqlState: "23505", constraint: "member_phone_uq" });
  });

  it("installs once", () => {
    const { target, written } = guardedConsole();
    installConsoleGuard(target);
    target.log("0712345678");
    expect(written).toEqual([["[redacted]"]]);
  });
});
