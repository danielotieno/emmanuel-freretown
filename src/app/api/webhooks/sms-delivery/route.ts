import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/app/_lib/db";
import { getLogger } from "@/app/_lib/log";
import { recordDeliveryReport } from "@/modules/notifications";

/** A delivery report is a few hundred bytes; anything far larger isn't one. */
const MAX_BODY_BYTES = 16 * 1024;

const STATUS = { updated: 200, ignored: 200, unauthorized: 401, malformed: 400 } as const;

/**
 * Mobile Sasa's delivery-report webhook (FR-8, issue #14). The module verifies the signature
 * (`X-MobileSasa-Signature`, HMAC with the webhook secret) before reading anything. 4xx only
 * when the report itself is wrong; Mobile Sasa retries on 5xx. The body holds the member's
 * phone number, so it is never logged.
 */
export async function POST(request: Request): Promise<Response> {
  const log = await getLogger();
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return new Response(null, { status: 413 });
  const rawBody = await readBody(request, MAX_BODY_BYTES);
  if (rawBody === null) return new Response(null, { status: 413 });

  const { env } = await getCloudflareContext({ async: true });
  const secret = (env as unknown as Record<string, unknown>).MOBILESASA_WEBHOOK_SECRET;
  if (typeof secret !== "string" || !secret) {
    log.error("sms.delivery_report_not_configured");
    return new Response(null, { status: 503 });
  }

  const result = await recordDeliveryReport(
    await getDb(),
    { rawBody, signature: request.headers.get("x-mobilesasa-signature") },
    secret,
  );
  if (result === "unauthorized") log.warn("sms.delivery_report_refused");
  else log.info("sms.delivery_report", { result });
  return new Response(null, { status: STATUS[result] });
}

/**
 * Reads the body as text, stopping at `maxBytes`: Content-Length can be missing or wrong, and
 * this endpoint is reachable by anyone until the signature is checked. Null when too large.
 */
async function readBody(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
