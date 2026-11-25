import { SafeError } from "../observability";

/**
 * The SMS provider behind a small interface, so the outbox doesn't depend on one vendor.
 * Mobile Sasa is the provider (D43). Its API: https://docs.mobilesasa.com
 */

export type SendResult =
  /** Queued with the carrier. Delivery is confirmed later by a delivery report. */
  | { outcome: "accepted"; messageId: string }
  /**
   * Mobile Sasa already delivered the same text to this number today, so an earlier attempt
   * got through. This guards against most double sends on retry, not all: a retry while the
   * first is still queued with the carrier can still be sent.
   */
  | { outcome: "duplicate" }
  /** The request itself is wrong (e.g. an invalid number); retrying can't help. */
  | { outcome: "rejected"; code: string }
  /** Temporary, or an account problem staff must fix (balance, token, sender). */
  | { outcome: "retry"; code: string; accountProblem: boolean };

export interface SmsMessage {
  /** E.164, a Kenyan mobile number. */
  to: string;
  text: string;
  /** Our id for the send, echoed back in delivery reports: the outbox row id. */
  trackingId: string;
}

export interface SmsProvider {
  send(message: SmsMessage): Promise<SendResult>;
  /** The remaining balance in SMS units (message parts). */
  balance(): Promise<number>;
}

export interface MobileSasaConfig {
  /** An `mbs_` token with the send-messages scope. */
  token: string;
  /** `MOBILESASA` (the shared sender) until our own sender ID is approved. */
  senderId: string;
  /** Where delivery reports for these sends go; otherwise the account's callback URL. */
  callbackUrl?: string;
  /** For tests; defaults to the global fetch. */
  fetch?: typeof fetch;
}

const API = "https://api.mobilesasa.com";
const TIMEOUT_MS = 10_000;

/** Response codes that need staff: balance (0402), token (0401, 0403), unknown sender (0404). */
const ACCOUNT_CODES = new Set(["0401", "0402", "0403", "0404"]);

export function createMobileSasa(config: MobileSasaConfig): SmsProvider {
  const http = config.fetch ?? fetch;
  const headers = {
    Authorization: `Bearer ${config.token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  return {
    async send(message) {
      let response: Response;
      try {
        // v2 carries our trackingId, so delivery reports join straight back to the outbox row.
        response = await http(`${API}/v2/send/message`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            senderID: config.senderId,
            phone: message.to,
            message: message.text,
            trackingId: message.trackingId,
            ...(config.callbackUrl ? { callbackUrl: config.callbackUrl } : {}),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (error) {
        const timeout = error instanceof Error && error.name === "TimeoutError";
        return { outcome: "retry", code: timeout ? "timeout" : "network", accountProblem: false };
      }
      // Only the code is ever kept: the provider's message text could echo what we sent.
      const body = (await response.json().catch(() => ({}))) as {
        responseCode?: unknown;
        messageId?: unknown;
      };
      const code = typeof body.responseCode === "string" ? body.responseCode : undefined;
      if (code === "0200" && typeof body.messageId === "string") {
        return { outcome: "accepted", messageId: body.messageId };
      }
      if (code === "0409") return { outcome: "duplicate" };
      if (code === "0422") return { outcome: "rejected", code };
      if (code && ACCOUNT_CODES.has(code)) {
        return { outcome: "retry", code, accountProblem: true };
      }
      return { outcome: "retry", code: code ?? `http_${response.status}`, accountProblem: false };
    },

    async balance() {
      const response = await http(`${API}/v1/get-balance/`, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = (await response.json().catch(() => ({}))) as {
        responseCode?: unknown;
        balance?: unknown;
      };
      if (body.responseCode !== "0200" || typeof body.balance !== "number") {
        throw new SafeError(
          "sms_balance_failed",
          `SMS balance check failed (HTTP ${response.status})`,
        );
      }
      return body.balance;
    },
  };
}
