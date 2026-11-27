import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { ArrowIcon } from "@/components/icons";
import { staffNames } from "@/modules/access";
import { getHighestFwoIssued, suggestFwoNumber } from "@/modules/registration";
import { formatDateTime } from "../review/format";
import { SettingForm } from "./setting-form";

export const metadata: Metadata = { title: "FWO numbers · Staff" };

/**
 * D30 (#101): the highest FWO number ever issued, and the next number the system will suggest
 * for a new member. For Membership Administrators and Super Administrators; the action checks
 * the role again.
 */
export default async function FwoPage() {
  await requireStaff("MEMBERSHIP_ADMIN");
  const db = await getDb();
  const [setting, suggestion] = await Promise.all([getHighestFwoIssued(db), suggestFwoNumber(db)]);
  const names = setting
    ? await staffNames(db, [setting.updatedByUserId])
    : new Map<string, string>();
  return (
    <main className="min-h-dvh bg-cloud pb-16">
      <div className="mx-auto max-w-prose px-4 pt-4 sm:px-6 sm:pt-8">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 text-small text-ink-muted hover:text-ink"
        >
          <ArrowIcon className="rotate-180" />
          Staff home
        </Link>
        <h1 className="mt-4 text-title">FWO numbers</h1>
        <p className="mt-2 text-ink-muted">
          New members get their FWO number from the Church Secretary, who enters it on their
          registration (BR-16). The system suggests the next number above the highest ever issued
          and every number in the register (D30).
        </p>
        <dl className="in-card mt-6 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper">
          <div className="grid gap-1 px-5 py-4 sm:grid-cols-3 sm:gap-4">
            <dt className="text-ink-muted">Highest ever issued</dt>
            <dd className="sm:col-span-2 tabular-nums">
              {setting ? (
                <>
                  {setting.value}
                  <span className="block text-small text-ink-muted">
                    {names.get(setting.updatedByUserId) ?? "A staff member"} ·{" "}
                    {formatDateTime(setting.updatedAt)}
                  </span>
                </>
              ) : (
                "Not recorded yet: no FWO number can be issued until it is"
              )}
            </dd>
          </div>
          <div className="grid gap-1 px-5 py-4 sm:grid-cols-3 sm:gap-4">
            <dt className="text-ink-muted">Next suggestion</dt>
            <dd className="sm:col-span-2 tabular-nums">{suggestion ?? "None yet"}</dd>
          </div>
        </dl>
        <div className="in-card mt-6 rounded-2xl border border-line bg-paper p-5 sm:p-6">
          <SettingForm current={setting?.value ?? null} />
        </div>
      </div>
    </main>
  );
}
