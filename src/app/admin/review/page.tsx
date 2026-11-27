import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { ArrowIcon, CheckIcon, ChevronIcon } from "@/components/icons";
import { listActiveHbcs, unitNames } from "@/modules/organisation";
import {
  listQueueEvents,
  listReviewQueue,
  QUEUE_FLAGS,
  type QueueFilters,
  type QueueFlag,
} from "@/modules/registration";
import { formatDateTime } from "./format";

export const metadata: Metadata = { title: "Review queue · Staff" };

const FLAG_NAMES: Record<QueueFlag, string> = {
  FWO_CONFLICT: "FWO conflict",
  PHONE_CONFLICT: "Phone conflict",
  NEW_MEMBER: "New member",
};

const DONE_MESSAGES: Record<string, string> = {
  approved: "Approved. The member record was created.",
  rejected: "Rejected.",
  correction: "Correction requested.",
};

type Search = Record<string, string | string[] | undefined>;

function one(search: Search, name: string): string | undefined {
  const value = search[name];
  return typeof value === "string" && value ? value.slice(0, 200) : undefined;
}

/** The filters from the URL: only ids, codes and event names, never personal data (rule 2). */
function filtersOf(search: Search): QueueFilters {
  const channel = one(search, "channel");
  const flag = one(search, "flag");
  return {
    hbcId: one(search, "hbc"),
    channel: channel === "SELF" || channel === "ASSISTED" ? channel : undefined,
    flag: (QUEUE_FLAGS as readonly string[]).includes(flag ?? "") ? (flag as QueueFlag) : undefined,
    eventLabel: one(search, "event"),
  };
}

/**
 * The review queue (FR-4, #19): submitted registrations, oldest first, for Membership
 * Administrators and Super Administrators. Viewing the queue is not recorded (D31); opening a
 * registration is.
 */
export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireStaff("MEMBERSHIP_ADMIN");
  const search = await searchParams;
  const filters = filtersOf(search);
  const db = await getDb();
  const [{ items, total }, hbcs, events, units] = await Promise.all([
    listReviewQueue(db, filters),
    listActiveHbcs(db),
    listQueueEvents(db),
    unitNames(db),
  ]);
  const done = DONE_MESSAGES[one(search, "done") ?? ""];
  const filtered = Object.values(filters).some(Boolean);

  return (
    <main className="min-h-dvh bg-cloud pb-16">
      <div className="mx-auto max-w-content px-4 pt-4 sm:px-6 sm:pt-8 lg:px-10">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 text-small text-ink-muted hover:text-ink"
        >
          <ArrowIcon className="rotate-180" />
          Staff home
        </Link>
        <h1 className="mt-4 text-title">Review queue</h1>
        <p className="mt-2 text-ink-muted">Registrations waiting for a decision, oldest first.</p>

        {done && (
          <p role="status" className="mt-6 flex gap-3 rounded-xl bg-mist p-4">
            <CheckIcon size="size-5" />
            <span>{done}</span>
          </p>
        )}

        <form method="get" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Select label="HBC" name="hbc" value={filters.hbcId}>
            <option value="">All HBCs</option>
            {hbcs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
          <Select label="Channel" name="channel" value={filters.channel}>
            <option value="">Both channels</option>
            <option value="SELF">Self-registration</option>
            <option value="ASSISTED">Assisted</option>
          </Select>
          <Select label="Flag" name="flag" value={filters.flag}>
            <option value="">Any</option>
            {QUEUE_FLAGS.map((f) => (
              <option key={f} value={f}>
                {FLAG_NAMES[f]}
              </option>
            ))}
          </Select>
          <Select label="Event" name="event" value={filters.eventLabel}>
            <option value="">Any event</option>
            {events.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </Select>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1">
              Filter
            </button>
            {filtered && (
              <Link href="/review" className="btn-text">
                Clear
              </Link>
            )}
          </div>
        </form>

        <p className="mt-6 text-small text-ink-muted" aria-live="polite">
          {total === 0
            ? filtered
              ? "No registrations match these filters."
              : "Nothing is waiting for review."
            : items.length < total
              ? `Showing the oldest ${items.length} of ${total}.`
              : `${total} waiting.`}
        </p>

        {items.length > 0 && (
          <ul className="in-card mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper text-card">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/review/${item.id}`}
                  className="grid gap-1 px-5 py-4 hover:bg-mist sm:grid-cols-12 sm:items-center sm:gap-4"
                >
                  <span className="text-brand tabular-nums sm:col-span-2">{item.reference}</span>
                  <span className="sm:col-span-3">{item.fullName}</span>
                  <span className="text-ink-muted sm:col-span-2">
                    {item.hbcId ? units.hbcs.get(item.hbcId) : "HBC to be set"}
                  </span>
                  <span className="text-small text-ink-muted sm:col-span-3">
                    {item.channel === "SELF" ? "Self" : `Assisted · ${item.eventLabel ?? ""}`}
                    <span className="block">{formatDateTime(item.submittedAt)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5 sm:col-span-2">
                    {item.fwoConflict && <Tag>{FLAG_NAMES.FWO_CONFLICT}</Tag>}
                    {item.phoneConflict && <Tag>{FLAG_NAMES.PHONE_CONFLICT}</Tag>}
                    {item.isNewMember && <Tag>{FLAG_NAMES.NEW_MEMBER}</Tag>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function Select(props: { label: string; name: string; value?: string; children: ReactNode }) {
  const id = `filter-${props.name}`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-small text-ink-muted">
        {props.label}
      </label>
      <div className="relative">
        <select
          id={id}
          name={props.name}
          defaultValue={props.value ?? ""}
          className="field cursor-pointer appearance-none pr-12"
        >
          {props.children}
        </select>
        <ChevronIcon className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-ink-muted" />
      </div>
    </div>
  );
}

/** A flag in words, never colour alone (DESIGN.md §2). */
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-line-strong bg-mist px-2.5 py-0.5 text-small text-ink">
      {children}
    </span>
  );
}
