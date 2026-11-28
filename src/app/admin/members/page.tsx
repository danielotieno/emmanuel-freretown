import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { ArrowIcon, ChevronIcon } from "@/components/icons";
import {
  listMembers,
  MEMBER_STATUSES,
  type MemberListFilters,
  type MemberStatus,
} from "@/modules/membership";
import { listActiveHbcs } from "@/modules/organisation";
import { MemberList } from "./member-list";
import { STATUS_NAMES } from "./names";
import { SearchForm } from "./search-form";

export const metadata: Metadata = { title: "Members · Staff" };

type Search = Record<string, string | string[] | undefined>;

function one(search: Search, name: string): string | undefined {
  const value = search[name];
  return typeof value === "string" && value ? value.slice(0, 64) : undefined;
}

/** The filters from the URL: an HBC id and a status, never personal data (rule 2). */
function filtersOf(search: Search): MemberListFilters {
  const status = one(search, "status");
  return {
    hbcId: one(search, "hbc"),
    status: (MEMBER_STATUSES as readonly string[]).includes(status ?? "")
      ? (status as MemberStatus)
      : undefined,
  };
}

/**
 * The member records (FR-6, #22), for Membership Administrators and Super Administrators: by
 * name, filtered by HBC and status, a search that posts its terms, and the CSV export (FR-12,
 * #25). Viewing the list is not recorded (D31); a search, opening a record and an export are.
 */
export default async function MembersPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireStaff("MEMBERSHIP_ADMIN");
  const filters = filtersOf(await searchParams);
  const db = await getDb();
  const [{ items, total }, hbcs] = await Promise.all([
    listMembers(db, filters),
    listActiveHbcs(db),
  ]);
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
        <h1 className="mt-4 text-title">Members</h1>
        <p className="mt-2 text-ink-muted">
          The official registry. Open a record to view it, correct the details, move the member to
          another HBC or change their status.
        </p>

        <SearchForm />

        <section aria-labelledby="list-heading" className="mt-12">
          <h2 id="list-heading" className="text-subtitle">
            All members
          </h2>
          <form method="get" className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <Select label="HBC" name="hbc" value={filters.hbcId}>
              <option value="">All HBCs</option>
              {hbcs.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
            <Select label="Status" name="status" value={filters.status}>
              <option value="">Any status</option>
              {MEMBER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_NAMES[s]}
                </option>
              ))}
            </Select>
            <div className="flex gap-3">
              <button type="submit" className="btn-primary flex-1">
                Filter
              </button>
              {filtered && (
                <Link href="/members" className="btn-text">
                  Clear
                </Link>
              )}
            </div>
          </form>

          <p className="mt-6 text-small text-ink-muted" aria-live="polite">
            {total === 0
              ? filtered
                ? "No members match these filters."
                : "The registry has no members yet."
              : items.length < total
                ? `Showing the first ${items.length} of ${total}, by name. Filter or search to find others.`
                : `${total} ${total === 1 ? "member" : "members"}.`}
          </p>
          <MemberList items={items} />
        </section>

        <section aria-labelledby="export-heading" className="mt-12">
          <h2 id="export-heading" className="text-subtitle">
            Export
          </h2>
          <p className="mt-2 text-ink-muted">
            Every active member as a CSV file: FWO number, name, mobile number, HBC and departments.
            Each download is recorded in the audit log, with how many members it holds.
          </p>
          <p className="mt-2 text-ink-muted">
            The file holds members&rsquo; personal details. Keep it only where it is needed, and
            delete it when you are done.
          </p>
          {/* A POST, so no link or reload runs an export (src/app/admin/members/export). */}
          <form method="post" action="/members/export" className="mt-4">
            <button type="submit" className="btn-secondary">
              Download the CSV
            </button>
          </form>
        </section>
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
