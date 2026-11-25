import { describe, expect, it } from "vitest";
import { TURNSTILE_VERIFY_URL, verifyTurnstile } from "./turnstile";

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: init.body as URLSearchParams });
    return respond();
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("verifyTurnstile (rule 8, issue #13)", () => {
  it("passes a token Cloudflare accepts, sending the secret, token and IP", async () => {
    const { fetch, calls } = fakeFetch(() => json({ success: true }));
    expect(await verifyTurnstile("tok", { secret: "s3cret", ip: "198.51.100.7", fetch })).toBe(
      true,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(TURNSTILE_VERIFY_URL);
    expect(Object.fromEntries(calls[0]!.body)).toEqual({
      secret: "s3cret",
      response: "tok",
      remoteip: "198.51.100.7",
    });
  });

  it.each([
    ["a refusal", () => json({ success: false, "error-codes": ["invalid-input-response"] })],
    ["a non-boolean success", () => json({ success: "true" })],
    ["an HTTP error", () => json({ success: true }, 500)],
    ["a body that isn't JSON", () => new Response("<html>")],
    [
      "a network failure",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("fails closed on %s", async (_name, respond) => {
    const { fetch } = fakeFetch(respond);
    expect(await verifyTurnstile("tok", { secret: "s", fetch })).toBe(false);
  });

  it("refuses an empty or oversized token, or a missing secret, without calling Cloudflare", async () => {
    const { fetch, calls } = fakeFetch(() => json({ success: true }));
    expect(await verifyTurnstile("", { secret: "s", fetch })).toBe(false);
    expect(await verifyTurnstile("x".repeat(2049), { secret: "s", fetch })).toBe(false);
    expect(await verifyTurnstile("tok", { secret: "", fetch })).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
