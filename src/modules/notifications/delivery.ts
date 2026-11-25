import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { safeQuery, type DbOrTx } from "../../db";
import { smsOutbox } from "../../db/schema";
import { hmacSha256Hex, timingSafeEqual } from "../../lib/crypto";

/** Reports older (or further in the future) than this are refused as possible replays. */
const MAX_AGE_SECONDS = 300;

/**
 * Checks Mobile Sasa's `X-MobileSasa-Signature: t=<unix seconds>,v1=<hex>`, where the hex is
 * HMAC-SHA256 of `<t>.<raw body>` keyed with the webhook secret. The secret itself never
 * travels, and the timestamp stops a captured report from being replayed later.
 */
export async function verifyDeliverySignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = new Map(
    header.split(",").map((part) => {
      const at = part.indexOf("=");
      return [part.slice(0, at).trim(), part.slice(at + 1).trim()] as const;
    }),
  );
  const t = parts.get("t");
  const v1 = parts.get("v1");
  if (!t || !/^\d{1,12}$/.test(t) || !v1 || !/^[0-9a-f]{64}$/i.test(v1)) return false;
  if (Math.abs(nowSeconds - Number(t)) > MAX_AGE_SECONDS) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return timingSafeEqual(expected, v1.toLowerCase());
}

/** The fields of a delivery report we use. `msisdn` and the rest are ignored, never stored. */
const report = z.object({
  status: z.string(),
  trackingId: z.string().optional(),
  reference: z.string().optional(),
});

const FAILED_STATUSES = new Set(["Failed", "Rejected", "Expired", "Unreachable"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type DeliveryReportResult = "updated" | "ignored" | "unauthorized" | "malformed";

/**
 * Records a delivery report from the provider's webhook (FR-8: delivery status is recorded).
 * Unsigned or forged reports are `unauthorized` and change nothing. A report finds its row by
 * our trackingId (the outbox id) or by the provider's message id. Delivered marks the row
 * DELIVERED; a final failure (Failed, Rejected, Expired, Unreachable) marks a SENT row FAILED
 * with the status as its error. Reports arrive at least once and in any order: a DELIVERED row
 * never changes again, and repeats are `ignored`.
 */
export async function recordDeliveryReport(
  db: DbOrTx,
  request: { rawBody: string; signature: string | null },
  secret: string,
  nowSeconds?: number,
): Promise<DeliveryReportResult> {
  if (!(await verifyDeliverySignature(request.rawBody, request.signature, secret, nowSeconds))) {
    return "unauthorized";
  }
  let parsed: z.infer<typeof report>;
  try {
    parsed = report.parse(JSON.parse(request.rawBody));
  } catch {
    return "malformed";
  }

  const matches: SQL[] = [];
  if (parsed.trackingId && UUID.test(parsed.trackingId)) {
    matches.push(eq(smsOutbox.id, parsed.trackingId));
  }
  if (parsed.reference) matches.push(eq(smsOutbox.providerMessageId, parsed.reference));
  if (matches.length === 0) return "malformed";

  const match = or(...matches);
  let update;
  if (parsed.status === "Delivered") {
    update = db
      .update(smsOutbox)
      .set({ status: "DELIVERED", deliveredAt: sql`now()` })
      .where(and(match, inArray(smsOutbox.status, ["PENDING", "SENT", "FAILED"])));
  } else if (FAILED_STATUSES.has(parsed.status)) {
    update = db
      .update(smsOutbox)
      .set({ status: "FAILED", lastError: parsed.status })
      .where(and(match, eq(smsOutbox.status, "SENT")));
  } else {
    return "ignored"; // "Sent" is interim; a final report follows.
  }
  const updated = await safeQuery(() => update.returning({ id: smsOutbox.id }));
  return updated.length > 0 ? "updated" : "ignored";
}
