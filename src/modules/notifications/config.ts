import { z } from "zod";
import type { DbOrTx } from "../../db";
import { reportError, SafeError } from "../observability";
import { getSmsSetting } from "./cap";
import { createMobileSasa, type SmsProvider } from "./provider";

const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);

/** The Worker's SMS secrets and settings (`.dev.vars.example`, docs/operations/environments.md). */
const smsEnv = z.object({
  MOBILESASA_API_TOKEN: z.string().min(1),
  MOBILESASA_SENDER_ID: z.preprocess(blankToUndefined, z.string().min(1).default("MOBILESASA")),
  MOBILESASA_CALLBACK_URL: z.preprocess(
    blankToUndefined,
    z.url({ protocol: /^https$/ }).optional(),
  ),
});

/** Whether the environment has the SMS secrets (local runs and CI don't). */
export function isSmsConfigured(env: Record<string, unknown>): boolean {
  return smsEnv.safeParse(env).success;
}

/**
 * The SMS provider configured by the environment. Throws a SafeError naming no value if a
 * secret is missing, so a misconfigured environment fails loudly instead of dropping SMS.
 */
export function smsProviderFromEnv(env: Record<string, unknown>): SmsProvider {
  const parsed = smsEnv.safeParse(env);
  if (!parsed.success) {
    throw new SafeError("sms_not_configured", "The SMS provider is not configured");
  }
  return createMobileSasa({
    token: parsed.data.MOBILESASA_API_TOKEN,
    senderId: parsed.data.MOBILESASA_SENDER_ID,
    callbackUrl: parsed.data.MOBILESASA_CALLBACK_URL,
  });
}

/**
 * The daily low-balance check (issue #14): alerts staff through Sentry when the provider
 * balance, in SMS units, is below the `low_balance_units` setting. Mobile Sasa also sends its
 * own low-balance SMS to the account phone when a threshold is set in its portal.
 */
export async function checkSmsBalance(
  db: DbOrTx,
  provider: SmsProvider,
): Promise<{ units: number; threshold: number; low: number }> {
  // One after the other: if the provider call failed while the query was still running, the
  // job's database handle would close under it.
  const threshold = await getSmsSetting(db, "low_balance_units");
  const units = await provider.balance();
  const low = units < threshold ? 1 : 0;
  if (low) {
    reportError(new SafeError("sms_low_balance", "SMS balance is low; top up the account"), {
      units: String(units),
      threshold: String(threshold),
    });
  }
  return { units, threshold, low };
}
