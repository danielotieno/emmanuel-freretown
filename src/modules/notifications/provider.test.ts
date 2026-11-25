import { describe, expect, it } from "vitest";
import { SafeError } from "../observability";
import { smsProviderFromEnv } from "./config";
import { createMobileSasa } from "./provider";

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return respond(call);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const message = {
  to: "+254700000001",
  text: "Hello",
  trackingId: "0b6c3f9e-4d1a-4c2b-9f7e-2a5d8e1c3b40",
};

describe("createMobileSasa().send", () => {
  it("sends a v2 message with our tracking id and the callback URL, by bearer token", async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({ status: true, responseCode: "0200", message: "Accepted", messageId: "m-1", cost: 1 }),
    );
    const sasa = createMobileSasa({
      token: "mbs_test",
      senderId: "MOBILESASA",
      callbackUrl: "https://example.test/api/webhooks/sms-delivery",
      fetch,
    });
    expect(await sasa.send(message)).toEqual({ outcome: "accepted", messageId: "m-1" });
    expect(calls[0]!.url).toBe("https://api.mobilesasa.com/v2/send/message");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe(
      "Bearer mbs_test",
    );
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      senderID: "MOBILESASA",
      phone: "+254700000001",
      message: "Hello",
      trackingId: message.trackingId,
      callbackUrl: "https://example.test/api/webhooks/sms-delivery",
    });
  });

  it.each([
    ["0409", { outcome: "duplicate" }],
    ["0422", { outcome: "rejected", code: "0422" }],
    ["0402", { outcome: "retry", code: "0402", accountProblem: true }],
    ["0401", { outcome: "retry", code: "0401", accountProblem: true }],
    ["0404", { outcome: "retry", code: "0404", accountProblem: true }],
  ])("maps response code %s", async (responseCode, expected) => {
    const { fetch } = fakeFetch(() =>
      json({ status: false, responseCode, message: "The phone +254700000001 is invalid." }),
    );
    const result = await createMobileSasa({ token: "t", senderId: "S", fetch }).send(message);
    expect(result).toEqual(expected);
    // Never the provider's message text: it can echo what we sent.
    expect(JSON.stringify(result)).not.toContain("+254");
  });

  it("retries an HTTP error without a body, and a network failure", async () => {
    const http = fakeFetch(() => new Response("Bad gateway", { status: 502 }));
    expect(
      await createMobileSasa({ token: "t", senderId: "S", fetch: http.fetch }).send(message),
    ).toEqual({
      outcome: "retry",
      code: "http_502",
      accountProblem: false,
    });
    const down = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });
    expect(
      await createMobileSasa({ token: "t", senderId: "S", fetch: down.fetch }).send(message),
    ).toEqual({
      outcome: "retry",
      code: "network",
      accountProblem: false,
    });
  });
});

describe("createMobileSasa().balance", () => {
  it("returns the balance in SMS units", async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({ status: true, responseCode: "0200", balance: 14250, localAccountNumber: "X" }),
    );
    expect(await createMobileSasa({ token: "t", senderId: "S", fetch }).balance()).toBe(14250);
    expect(calls[0]!.url).toBe("https://api.mobilesasa.com/v1/get-balance/");
  });

  it("throws a safe error when the balance can't be read", async () => {
    const { fetch } = fakeFetch(() => json({ status: false, responseCode: "0401" }, 401));
    await expect(createMobileSasa({ token: "t", senderId: "S", fetch }).balance()).rejects.toThrow(
      SafeError,
    );
  });
});

describe("smsProviderFromEnv", () => {
  it("needs the token, defaults the sender and refuses a non-https callback", () => {
    expect(() => smsProviderFromEnv({})).toThrow(SafeError);
    expect(() => smsProviderFromEnv({ MOBILESASA_API_TOKEN: "" })).toThrow(SafeError);
    expect(() =>
      smsProviderFromEnv({ MOBILESASA_API_TOKEN: "t", MOBILESASA_CALLBACK_URL: "" }),
    ).not.toThrow();
    expect(() =>
      smsProviderFromEnv({
        MOBILESASA_API_TOKEN: "t",
        MOBILESASA_CALLBACK_URL: "http://example.test/x",
      }),
    ).toThrow(SafeError);
  });
});
