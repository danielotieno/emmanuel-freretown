"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { getDb } from "@/app/_lib/db";
import { getLogger } from "@/app/_lib/log";
import { requireStaff } from "@/app/_lib/staff";
import { setHighestFwoIssued } from "@/modules/registration";

/**
 * D30: the Church Secretary records the highest FWO number ever issued (#101). Only a
 * Membership Administrator (or a Super Administrator) may, checked first (CLAUDE.md rule 1).
 */

export interface SettingState {
  error?: string;
  done?: boolean;
}

export async function setHighestAction(
  _previous: SettingState,
  form: FormData,
): Promise<SettingState> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const value = form.get("highestIssued");
  const result = await setHighestFwoIssued(await getDb(), {
    value: typeof value === "string" ? value : "",
    actor: { type: "STAFF", userId: staff.userId },
    requestId: (await headers()).get("x-request-id") ?? undefined,
  });
  (await getLogger()).info("fwo_setting.saved", { outcome: result.ok ? "saved" : result.reason });
  if (!result.ok) {
    return {
      error:
        result.reason === "invalid"
          ? "Use digits only, as on the envelopes (BR-01)."
          : `The platform has already issued ${result.highestIssued}. The highest ever issued can't be lower, or an old number could be suggested again (D2).`,
    };
  }
  refresh();
  return { done: true };
}
