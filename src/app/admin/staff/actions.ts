"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { getLogger } from "@/app/_lib/log";
import { requireStaff } from "@/app/_lib/staff";
import {
  createStaffUser,
  grantRole,
  resetPassword,
  resetSecondFactor,
  revokeRole,
  revokeSessions,
  STAFF_ROLES,
  type StaffChangeResult,
  type StaffRole,
} from "@/modules/access";
import { INPUT_ERRORS, REFUSAL_MESSAGES } from "./messages";

/**
 * Super Administrators manage staff accounts (FR-10, #91). Every action checks the staff session
 * and role first (CLAUDE.md rule 1); the access module checks the rest and audits each change. A
 * temporary password is returned to the form once, never put in a URL or a log (rule 2).
 */

export interface CreateStaffState {
  errors?: Partial<Record<"name" | "email" | "roles" | "form", string>>;
  /** As typed, shown again after a refusal. */
  values?: { name: string; email: string; roles: string[] };
  created?: { userId: string; name: string; temporaryPassword: string };
}

export interface ResetPasswordState {
  error?: string;
  temporaryPassword?: string;
}

function field(form: FormData, name: string, max = 300): string {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, max) : "";
}

async function requestId(): Promise<string | undefined> {
  return (await headers()).get("x-request-id") ?? undefined;
}

/** The target and actor of a change to one staff account. */
async function target(form: FormData, actorId: string) {
  return {
    userId: field(form, "userId", 64),
    actor: { type: "STAFF" as const, userId: actorId },
    requestId: await requestId(),
  };
}

function roleOf(form: FormData): StaffRole | null {
  const role = field(form, "role", 40);
  return (STAFF_ROLES as readonly string[]).includes(role) ? (role as StaffRole) : null;
}

/** Back to the staff member's page with what happened, or why not: codes only. */
async function answer(userId: string, change: string, result: StaffChangeResult): Promise<never> {
  const log = await getLogger();
  if (result.ok) {
    log.info("staff_user.changed", { change });
    redirect(`/staff/${encodeURIComponent(userId)}?done=${change}`);
  }
  log.info("staff_user.change_refused", { change, reason: result.reason });
  redirect(`/staff/${encodeURIComponent(userId)}?refused=${result.reason}`);
}

export async function createStaffAction(
  _previous: CreateStaffState,
  form: FormData,
): Promise<CreateStaffState> {
  const staff = await requireStaff("SUPER_ADMIN");
  const values = {
    name: field(form, "name"),
    email: field(form, "email"),
    roles: form.getAll("roles").filter((r): r is string => typeof r === "string"),
  };
  const result = await createStaffUser(await getDb(), {
    ...values,
    actor: { type: "STAFF", userId: staff.userId },
    requestId: await requestId(),
  });
  const log = await getLogger();
  if (result.ok) {
    log.info("staff_user.created", { roles: values.roles.length });
    return {
      created: {
        userId: result.userId,
        name: values.name.trim(),
        temporaryPassword: result.temporaryPassword,
      },
    };
  }
  log.info("staff_user.create_refused", { reason: result.reason });
  if (result.reason === "email_taken") {
    return { values, errors: { email: "A staff account with this email address already exists." } };
  }
  const errors: CreateStaffState["errors"] = {};
  for (const [key, error] of Object.entries(result.errors)) {
    const k = key as keyof typeof INPUT_ERRORS;
    errors[k] = INPUT_ERRORS[k][error];
  }
  return { values, errors };
}

export async function grantRoleAction(form: FormData): Promise<void> {
  const staff = await requireStaff("SUPER_ADMIN");
  const c = await target(form, staff.userId);
  const role = roleOf(form);
  if (!role) redirect(`/staff/${encodeURIComponent(c.userId)}`);
  await answer(c.userId, "granted", await grantRole(await getDb(), { ...c, role }));
}

export async function revokeRoleAction(form: FormData): Promise<void> {
  const staff = await requireStaff("SUPER_ADMIN");
  const c = await target(form, staff.userId);
  const role = roleOf(form);
  if (!role) redirect(`/staff/${encodeURIComponent(c.userId)}`);
  await answer(c.userId, "revoked", await revokeRole(await getDb(), { ...c, role }));
}

export async function resetSecondFactorAction(form: FormData): Promise<void> {
  const staff = await requireStaff("SUPER_ADMIN");
  const c = await target(form, staff.userId);
  await answer(c.userId, "second_factor", await resetSecondFactor(await getDb(), c));
}

export async function revokeSessionsAction(form: FormData): Promise<void> {
  const staff = await requireStaff("SUPER_ADMIN");
  const c = await target(form, staff.userId);
  await answer(c.userId, "sessions", await revokeSessions(await getDb(), c));
}

export async function resetPasswordAction(
  _previous: ResetPasswordState,
  form: FormData,
): Promise<ResetPasswordState> {
  const staff = await requireStaff("SUPER_ADMIN");
  const c = await target(form, staff.userId);
  const result = await resetPassword(await getDb(), c);
  const log = await getLogger();
  if (!result.ok) {
    log.info("staff_user.change_refused", { change: "password", reason: result.reason });
    return { error: REFUSAL_MESSAGES[result.reason] };
  }
  log.info("staff_user.changed", { change: "password" });
  return { temporaryPassword: result.temporaryPassword };
}
