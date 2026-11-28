"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { getLogger } from "@/app/_lib/log";
import { requirePasswordChange } from "@/app/_lib/staff";
import {
  changeOwnPassword,
  MIN_PASSWORD_LENGTH,
  type PasswordChangeRefusal,
} from "@/modules/access";

export interface ChangePasswordState {
  error?: string;
}

const REFUSALS: Record<PasswordChangeRefusal | "mismatch", string> = {
  wrong_password: "Your current password isn't right.",
  too_short: `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
  too_long: "Choose a password of 128 characters or fewer.",
  unchanged: "Choose a password different from the current one.",
  mismatch: "The two new passwords don't match.",
};

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, 1000) : "";
}

/**
 * A staff member changes their own password (FR-10, #91): required while they hold a temporary
 * one, open to anyone signed in otherwise. The session check comes first (CLAUDE.md rule 1).
 * Nothing typed is logged or sent back.
 */
export async function changePasswordAction(
  _previous: ChangePasswordState,
  form: FormData,
): Promise<ChangePasswordState> {
  const staff = await requirePasswordChange();
  const newPassword = field(form, "newPassword");
  const log = await getLogger();
  const refused = (reason: keyof typeof REFUSALS) => {
    log.info("staff_user.password_change_refused", { reason });
    return { error: REFUSALS[reason] };
  };
  if (newPassword !== field(form, "confirmPassword")) return refused("mismatch");
  const result = await changeOwnPassword(await getDb(), {
    userId: staff.userId,
    sessionId: staff.sessionId,
    currentPassword: field(form, "currentPassword"),
    newPassword,
    requestId: (await headers()).get("x-request-id") ?? undefined,
  });
  if (!result.ok) return refused(result.reason);
  log.info("staff_user.password_changed", { forced: staff.forced });
  // A new staff member goes on to set up their authenticator app; the home page sends them.
  redirect(staff.forced ? "/" : "/change-password?done=1");
}
