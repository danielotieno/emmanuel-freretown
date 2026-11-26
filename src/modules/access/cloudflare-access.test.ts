import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  accessJwtPolicy,
  clearAccessKeyCache,
  passesAccess,
  verifyAccessJwt,
  type AccessJwtPolicy,
} from "./cloudflare-access";

const TEAM = "ack-emmanuel.cloudflareaccess.com";
const AUD = "aud-tag-for-the-staff-portal";
const NOW = new Date("2026-11-26T08:00:00Z");
const nowS = Math.floor(NOW.getTime() / 1000);

let signingKey: CryptoKey;
let otherKey: CryptoKey;
let publicJwk: JsonWebKey & { kid: string };
let fetches = 0;

const b64url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const json = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

async function sign(
  claims: Record<string, unknown>,
  { kid = "key-1", key = signingKey, alg = "RS256" } = {},
): Promise<string> {
  const head = json({ alg, kid, typ: "JWT" });
  const body = json(claims);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}

const valid = () => ({
  aud: [AUD],
  iss: `https://${TEAM}`,
  exp: nowS + 600,
  iat: nowS - 10,
  nbf: nowS - 10,
  type: "app",
});

const fakeFetch = (async () => {
  fetches++;
  return new Response(JSON.stringify({ keys: [publicJwk] }));
}) as unknown as typeof fetch;

const policy: Extract<AccessJwtPolicy, { mode: "verify" }> = {
  mode: "verify",
  teamDomain: TEAM,
  audience: AUD,
  fetch: fakeFetch,
};

async function rsaKeyPair() {
  return crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

beforeAll(async () => {
  const pair = await rsaKeyPair();
  signingKey = pair.privateKey;
  publicJwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "key-1" };
  otherKey = (await rsaKeyPair()).privateKey;
});

beforeEach(() => {
  clearAccessKeyCache();
  fetches = 0;
});

describe("verifyAccessJwt", () => {
  it("accepts a token signed by the team's key for this application", async () => {
    expect(await verifyAccessJwt(await sign(valid()), policy, NOW)).toBe(true);
  });

  it("fetches the team's keys once and reuses them", async () => {
    await verifyAccessJwt(await sign(valid()), policy, NOW);
    await verifyAccessJwt(await sign(valid()), policy, NOW);
    expect(fetches).toBe(1);
  });

  it("refuses a missing or malformed token", async () => {
    expect(await verifyAccessJwt(null, policy, NOW)).toBe(false);
    expect(await verifyAccessJwt("", policy, NOW)).toBe(false);
    expect(await verifyAccessJwt("not.a.jwt", policy, NOW)).toBe(false);
    expect(await verifyAccessJwt("a.b", policy, NOW)).toBe(false);
  });

  it("refuses a token for another Access application", async () => {
    expect(await verifyAccessJwt(await sign({ ...valid(), aud: ["other"] }), policy, NOW)).toBe(
      false,
    );
  });

  it("refuses a token from another team", async () => {
    const token = await sign({ ...valid(), iss: "https://someone-else.cloudflareaccess.com" });
    expect(await verifyAccessJwt(token, policy, NOW)).toBe(false);
  });

  it("refuses an expired token, or one not valid yet", async () => {
    expect(await verifyAccessJwt(await sign({ ...valid(), exp: nowS - 120 }), policy, NOW)).toBe(
      false,
    );
    expect(await verifyAccessJwt(await sign({ ...valid(), nbf: nowS + 600 }), policy, NOW)).toBe(
      false,
    );
  });

  it("refuses a token signed by any other key", async () => {
    expect(await verifyAccessJwt(await sign(valid(), { key: otherKey }), policy, NOW)).toBe(false);
  });

  it("refuses an unknown key id, after looking for new keys once", async () => {
    expect(await verifyAccessJwt(await sign(valid(), { kid: "rotated" }), policy, NOW)).toBe(false);
    expect(fetches).toBeGreaterThanOrEqual(1);
  });

  it("refuses anything but RS256, including alg none", async () => {
    expect(await verifyAccessJwt(await sign(valid(), { alg: "HS256" }), policy, NOW)).toBe(false);
    const none = `${json({ alg: "none", kid: "key-1" })}.${json(valid())}.`;
    expect(await verifyAccessJwt(none, policy, NOW)).toBe(false);
  });

  it("refuses everything if the keys can't be fetched, without throwing", async () => {
    const down = { ...policy, fetch: (async () => new Response("", { status: 503 })) as never };
    expect(await verifyAccessJwt(await sign(valid()), down, NOW)).toBe(false);
    const offline = {
      ...policy,
      fetch: (async () => {
        throw new TypeError("network down");
      }) as never,
    };
    expect(await verifyAccessJwt(await sign(valid()), offline, NOW)).toBe(false);
    const garbled = { ...policy, fetch: (async () => new Response("<html>")) as never };
    expect(await verifyAccessJwt(await sign(valid()), garbled, NOW)).toBe(false);
  });
});

describe("accessJwtPolicy", () => {
  it("verifies when the team domain and audience are set", () => {
    expect(accessJwtPolicy({ deployed: true, teamDomain: TEAM, audience: AUD })).toEqual({
      mode: "verify",
      teamDomain: TEAM,
      audience: AUD,
    });
  });

  it("fails closed in staging and production when either is missing or wrong", () => {
    expect(accessJwtPolicy({ deployed: true, teamDomain: "", audience: AUD }).mode).toBe("refuse");
    expect(accessJwtPolicy({ deployed: true, teamDomain: TEAM, audience: "" }).mode).toBe("refuse");
    expect(
      accessJwtPolicy({ deployed: true, teamDomain: "evil.example.com", audience: AUD }).mode,
    ).toBe("refuse");
  });

  it("is skipped locally when not configured", () => {
    expect(accessJwtPolicy({ deployed: false, teamDomain: "", audience: "" }).mode).toBe("skip");
  });
});

describe("passesAccess", () => {
  it("reads the Cf-Access-Jwt-Assertion header", async () => {
    const headers = new Headers({ "Cf-Access-Jwt-Assertion": await sign(valid()) });
    expect(await passesAccess(headers, policy, NOW)).toBe(true);
    expect(await passesAccess(new Headers(), policy, NOW)).toBe(false);
  });

  it("always refuses under the refuse policy and always passes when skipped", async () => {
    const headers = new Headers({ "Cf-Access-Jwt-Assertion": await sign(valid()) });
    expect(await passesAccess(headers, { mode: "refuse" }, NOW)).toBe(false);
    expect(await passesAccess(new Headers(), { mode: "skip" }, NOW)).toBe(true);
  });
});
