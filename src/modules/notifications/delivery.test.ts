import { describe, expect, it } from "vitest";
import { hmacSha256Hex } from "../../lib/crypto";
import { verifyDeliverySignature } from "./delivery";

const SECRET = "whsec_test";
const BODY = '{"status":"Delivered","trackingId":"0b6c3f9e-4d1a-4c2b-9f7e-2a5d8e1c3b40"}';
const NOW = 1_795_600_000;

async function header(t: number, body = BODY, secret = SECRET) {
  return `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${body}`)}`;
}

describe("verifyDeliverySignature (issue #14)", () => {
  it("accepts a report signed with the webhook secret", async () => {
    expect(await verifyDeliverySignature(BODY, await header(NOW), SECRET, NOW)).toBe(true);
    expect(await verifyDeliverySignature(BODY, await header(NOW - 299), SECRET, NOW)).toBe(true);
  });

  it("refuses a report that is forged, altered, replayed or unsigned", async () => {
    expect(await verifyDeliverySignature(BODY, await header(NOW, BODY, "other"), SECRET, NOW)).toBe(
      false,
    );
    expect(
      await verifyDeliverySignature(
        BODY.replace("Delivered", "Failed"),
        await header(NOW),
        SECRET,
        NOW,
      ),
    ).toBe(false);
    expect(await verifyDeliverySignature(BODY, await header(NOW - 301), SECRET, NOW)).toBe(false);
    expect(await verifyDeliverySignature(BODY, await header(NOW + 301), SECRET, NOW)).toBe(false);
    expect(await verifyDeliverySignature(BODY, null, SECRET, NOW)).toBe(false);
    expect(await verifyDeliverySignature(BODY, "", SECRET, NOW)).toBe(false);
    expect(await verifyDeliverySignature(BODY, `t=${NOW}`, SECRET, NOW)).toBe(false);
    expect(await verifyDeliverySignature(BODY, `t=${NOW},v1=zz`, SECRET, NOW)).toBe(false);
    expect(await verifyDeliverySignature(BODY, await header(NOW), "", NOW)).toBe(false);
  });

  it("doesn't accept the bare secret in place of a signature", async () => {
    // X-MobileSasa-Secret carries the secret verbatim; we don't rely on it, because the
    // signature proves the same without the secret travelling, and also stops replays.
    expect(await verifyDeliverySignature(BODY, SECRET, SECRET, NOW)).toBe(false);
  });
});
