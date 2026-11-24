import type { ErrorEvent } from "@sentry/cloudflare";
import { describe, expect, it } from "vitest";
import { SafeError } from "./errors";
import { errorTags, registerErrorReporter, reportError, scrubEvent, sentryOptions } from "./sentry";

const PHONE = "+254712345678";

function event(): ErrorEvent {
  return {
    type: undefined,
    request: {
      method: "POST",
      url: `https://ackemmanuelfreretown.org/registration/status?phone=${PHONE}`,
      query_string: `phone=${PHONE}`,
      cookies: { session: "secret" },
      headers: { cookie: "session=secret", "cf-connecting-ip": "192.0.2.1" },
      data: { fullName: "Test Member", phone: PHONE },
    },
    user: { ip_address: "192.0.2.1" },
    extra: { phone: PHONE },
    server_name: "worker",
    tags: { sqlState: "23505", routePath: "/registration" },
    contexts: { runtime: { name: "cloudflare" } },
    exception: {
      values: [
        { type: "error", value: `Key (phone_e164)=(${PHONE}) already exists.` },
        {
          type: "Error",
          value: `Failed query: insert ...\nparams: Test Member,${PHONE}`,
          stacktrace: { frames: [{ function: "insert", vars: { phone: PHONE } }] },
        },
      ],
    },
  };
}

describe("scrubEvent", () => {
  it("leaves no personal data, cookies, headers, bodies, query strings or IPs", () => {
    const out = scrubEvent(event());
    expect(JSON.stringify(out)).not.toMatch(/712345678|Test Member|secret|192\.0\.2\.1|phone=/);
    expect(out.request).toEqual({
      method: "POST",
      url: "https://ackemmanuelfreretown.org/registration/status",
    });
    expect(out.user).toBeUndefined();
    expect(out.exception?.values?.map((e) => e.value)).toEqual(["[redacted]", "[redacted]"]);
  });

  it("keeps our own safe tags and the runtime context", () => {
    const out = scrubEvent(event());
    expect(out.tags).toEqual({ sqlState: "23505", routePath: "/registration" });
    expect(out.contexts).toEqual({ runtime: { name: "cloudflare" } });
  });
});

describe("sentryOptions", () => {
  it("sends nothing without a DSN", () => {
    expect(sentryOptions({})).toBeUndefined();
    expect(sentryOptions({ SENTRY_DSN: "" })).toBeUndefined();
  });

  it("leaves tracing off: no sample rate at all, because Sentry treats 0 as on", () => {
    const options = sentryOptions({ SENTRY_DSN: "https://k@o0.ingest.de.sentry.io/1" })!;
    expect("tracesSampleRate" in options).toBe(false);
    expect("tracesSampler" in options).toBe(false);
  });

  it("turns off every kind of data collection and all breadcrumbs (Sentry 11 defaults are on)", () => {
    const options = sentryOptions({ SENTRY_DSN: "https://k@o0.ingest.de.sentry.io/1" })!;
    expect(options.maxBreadcrumbs).toBe(0);
    expect(options.dataCollection).toEqual({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    });
  });

  it("drops the RequestData and Console integrations", () => {
    const options = sentryOptions({ SENTRY_DSN: "https://k@o0.ingest.de.sentry.io/1" })!;
    const integrations = options.integrations as (d: { name: string }[]) => { name: string }[];
    const kept = integrations([{ name: "RequestData" }, { name: "Console" }, { name: "Dedupe" }]);
    expect(kept.map((i) => i.name)).toEqual(["Dedupe"]);
  });
});

describe("errorTags", () => {
  it("tags a safe database error with its SQLSTATE and constraint", () => {
    const safe = Object.assign(
      new SafeError("database_error", "Database error on member.member_phone_uq"),
      {
        sqlState: "23505",
        constraint: "member_phone_uq",
      },
    );
    expect(errorTags(safe)).toEqual({
      errorName: "SafeError",
      errorCode: "database_error",
      sqlState: "23505",
      constraint: "member_phone_uq",
    });
  });
});

describe("reportError", () => {
  it("does nothing until a reporter is registered, then forwards", () => {
    const seen: unknown[] = [];
    reportError(new Error("before"));
    registerErrorReporter((error, tags) => seen.push([error, tags]));
    const error = new Error("after");
    reportError(error, { routePath: "/x" });
    registerErrorReporter(undefined);
    expect(seen).toEqual([[error, { routePath: "/x" }]]);
  });
});
