import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { CheckIcon } from "@/components/icons";
import { listCorrections } from "@/modules/registration";
import { formatDateTime } from "../review/format";
import { StaffShell } from "../_components/staff-shell";

export const metadata: Metadata = { title: "Corrections · Staff" };

/**
 * Registrations an administrator asked to be corrected (FR-5, #21), the longest waiting first,
 * for Registration Officers and administrators. The member was told by SMS to contact the church
 * office or visit the desk. Viewing the list is not recorded (D31); opening a registration is.
 */
export default async function CorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff(["REGISTRATION_OFFICER", "MEMBERSHIP_ADMIN"]);
  // Set by the correction action after it saves: only what happened (rule 2).
  const saved = (await searchParams).done === "1";
  const { items, total } = await listCorrections(await getDb());

  return (
    <StaffShell staff={staff} current="corrections" width="prose">
      <h1 className="text-title">Corrections</h1>
      <p className="mt-2 text-ink-muted">
        Registrations to correct with the member, who was asked by SMS to contact the office. Saving
        a correction returns the registration to the review queue.
      </p>
      {saved && (
        <p role="status" className="mt-6 flex gap-3 rounded-xl bg-mist p-4">
          <CheckIcon size="size-5" />
          <span>Correction saved. The registration is back in the review queue.</span>
        </p>
      )}
      <p className="mt-8 text-small text-ink-muted">
        {total === 0
          ? "Nothing is waiting for a correction."
          : items.length < total
            ? `Showing the ${items.length} waiting longest of ${total}.`
            : `${total} waiting.`}
      </p>
      {items.length > 0 && (
        <ul className="in-card mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper text-card">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/corrections/${item.id}`}
                className="grid gap-1 px-5 py-4 hover:bg-mist sm:grid-cols-12 sm:items-center sm:gap-4"
              >
                <span className="text-brand tabular-nums sm:col-span-3">{item.reference}</span>
                <span className="sm:col-span-5">{item.fullName}</span>
                <span className="text-small text-ink-muted sm:col-span-4">
                  {item.channel === "SELF" ? "Self" : "Assisted"}
                  <span className="block">Asked {formatDateTime(item.requestedAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </StaffShell>
  );
}
