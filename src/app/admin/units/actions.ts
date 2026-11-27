"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/app/_lib/db";
import { getLogger } from "@/app/_lib/log";
import { requireStaff } from "@/app/_lib/staff";
import {
  addUnit,
  moveUnit,
  renameUnit,
  setUnitActive,
  UNIT_KINDS,
  type UnitChangeResult,
  type UnitKind,
} from "@/modules/organisation";
import { refusalMessage } from "./messages";

/**
 * A Membership Administrator manages HBCs and departments (FR-9, #23). Every action checks the
 * staff session and role first (CLAUDE.md rule 1; a Super Administrator qualifies); the
 * organisation module checks everything else and audits each change. Unit names are not
 * personal data, so a refusal may keep the typed name; the URL carries only a code.
 */

export interface UnitFormState {
  error?: string;
  /** The name as typed, shown again after a refusal. */
  value?: string;
}

function field(form: FormData, name: string, max = 200): string {
  const value = form.get(name);
  return typeof value === "string" ? value.slice(0, max) : "";
}

async function common(form: FormData) {
  const kind = field(form, "kind", 20);
  return {
    kind: (UNIT_KINDS as readonly string[]).includes(kind) ? (kind as UnitKind) : null,
    id: field(form, "id", 64),
    requestId: (await headers()).get("x-request-id") ?? undefined,
  };
}

/**
 * Logs the outcome. On success, back to the list at the kind's section, saying only what
 * happened (rule 2); on a refusal, its message.
 */
async function answer(result: UnitChangeResult, kind: UnitKind, change: string): Promise<string> {
  const log = await getLogger();
  if (result.ok) {
    log.info("unit.changed", { kind, change });
    redirect(`/units?done=${change}#${kind}`);
  }
  log.info("unit.change_refused", { kind, change, reason: result.reason });
  return refusalMessage(
    result.reason === "invalid" ? { invalid: result.error } : result.reason,
    kind,
  );
}

/** For the buttons, which have no form state: a refusal goes back to the list with its code. */
async function answerButton(result: UnitChangeResult, kind: UnitKind, change: string) {
  await answer(result, kind, change);
  if (!result.ok && result.reason !== "invalid") {
    redirect(`/units?refused=${result.reason}&kind=${kind}#${kind}`);
  }
}

export async function addUnitAction(
  _previous: UnitFormState,
  form: FormData,
): Promise<UnitFormState> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const { kind, requestId } = await common(form);
  const name = field(form, "name");
  if (!kind) return { error: "Reload the page and try again.", value: name };
  const result = await addUnit(await getDb(), {
    kind,
    name,
    actor: { type: "STAFF", userId: staff.userId },
    requestId,
  });
  return { error: await answer(result, kind, "added"), value: name };
}

export async function renameUnitAction(
  _previous: UnitFormState,
  form: FormData,
): Promise<UnitFormState> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const { kind, id, requestId } = await common(form);
  const name = field(form, "name");
  if (!kind) return { error: "Reload the page and try again.", value: name };
  const result = await renameUnit(await getDb(), {
    kind,
    id,
    name,
    actor: { type: "STAFF", userId: staff.userId },
    requestId,
  });
  return { error: await answer(result, kind, "renamed"), value: name };
}

/** Moves a unit up or down; a refusal goes back to the list with its code. */
export async function moveUnitAction(form: FormData): Promise<void> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const { kind, id, requestId } = await common(form);
  if (!kind) redirect("/units");
  const result = await moveUnit(await getDb(), {
    kind,
    id,
    direction: field(form, "direction", 8) === "up" ? "up" : "down",
    actor: { type: "STAFF", userId: staff.userId },
    requestId,
  });
  await answerButton(result, kind, "moved");
}

/** Deactivates or reactivates a unit; a refusal goes back to the list with its code. */
export async function setUnitActiveAction(form: FormData): Promise<void> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const { kind, id, requestId } = await common(form);
  if (!kind) redirect("/units");
  const active = field(form, "active", 8) === "true";
  const result = await setUnitActive(await getDb(), {
    kind,
    id,
    active,
    actor: { type: "STAFF", userId: staff.userId },
    requestId,
  });
  await answerButton(result, kind, active ? "activated" : "deactivated");
}
