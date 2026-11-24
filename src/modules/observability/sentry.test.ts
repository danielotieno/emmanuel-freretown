import type { ErrorEvent } from "@sentry/cloudflare";
import { describe, expect, it } from "vitest";
import { SafeError } from "./errors";
import { registerErrorReporter, reportError, scrubEvent, sentryOptions } from "./sentry";

const PHONE = "+254712345678";

function event(): ErrorEvent {
  return {
    type: undefined,
    message: `failed for ${PHONE}`,
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
    breadcrumbs: [{ message: `console: ${PHONE}` }],
    server_name: "worker",
    tags: { phoneE164: PHONE, route: "/registration" },
    contexts: { member: { fwoNumber: "1234" } },
    exception: {
      values: [
        { type: "DatabaseError", value: `Key (phone_e164)=(${PHONE}) already exists.` },
        {
          type: "DrizzleQueryError",
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
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/712345678|Test Member|secret|192\.0\.2\.1|1234|phone=/);
    expect(out.request).toEqual({
      method: "POST",
      url: "https://ackemmanuelfreretown.org/registration/status",
    });
    expect(out.user).toBeUndefined();
    expect(out.breadcrumbs).toBeUndefined();
    expect(out.exception?.values?.map((e) => e.value)).toEqual(["[redacted]", "[redacted]"]);
  });

  it("keeps the message of the captured error when it is one of our safe errors", () => {
    const e: ErrorEvent = {
      type: undefined,
      exception: { values: [{ type: "SafeDatabaseError", value: "Database unique_violation" }] },
    };
    const out = scrubEvent(e, {
      originalException: new SafeError("x", "Database unique_violation"),
    });
    expect(out.exception?.values?.[0]?.value).toBe("Database unique_violation");
  });
});

describe("sentryOptions", () => {
  it("sends nothing without a DSN", () => {
    expect(sentryOptions({})).toBeUndefined();
    expect(sentryOptions({ SENTRY_DSN: "" })).toBeUndefined();
  });

  it("turns off data collection, tracing, breadcrumbs and request data", () => {
    const options = sentryOptions({ SENTRY_DSN: "https://k@o0.ingest.de.sentry.io/1" })!;
    expect(options).toMatchObject({ tracesSampleRate: 0, maxBreadcrumbs: 0 });
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    });
    expect(options.beforeBreadcrumb?.({ message: "x" }, undefined)).toBeNull();
    const integrations = options.integrations as (d: { name: string }[]) => { name: string }[];
    const kept = integrations([{ name: "RequestData" }, { name: "Console" }, { name: "Dedupe" }]);
    expect(kept.map((i) => i.name)).toEqual(["Dedupe"]);
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
