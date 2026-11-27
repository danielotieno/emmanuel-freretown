"use server";

import { headers } from "next/headers";
import { getDb } from "@/app/_lib/db";
import { getLogger } from "@/app/_lib/log";
import { requireStaff } from "@/app/_lib/staff";
import { searchMembers, type MemberListItem } from "@/modules/membership";

/**
 * A Membership Administrator searches the member records (FR-6, #22). The terms are posted,
 * never put in the URL, and never logged (rule 2); the membership module records the search
 * with its number of results (D31). The action checks the staff session and role first
 * (CLAUDE.md rule 1).
 */

export interface SearchState {
  error?: string;
  /** What was typed, kept in the page's memory only. */
  query?: string;
  items?: MemberListItem[];
  total?: number;
}

export async function searchAction(_previous: SearchState, form: FormData): Promise<SearchState> {
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const raw = form.get("query");
  const query = typeof raw === "string" ? raw.slice(0, 200) : "";
  const result = await searchMembers(await getDb(), {
    query,
    actor: { type: "STAFF", userId: staff.userId },
    requestId: (await headers()).get("x-request-id") ?? undefined,
  });
  const log = await getLogger();
  if (!result.ok) {
    log.info("member.search_refused", { reason: result.reason });
    return {
      query,
      error:
        result.reason === "too_short"
          ? "Type at least 2 characters: part of a name, an FWO number or a mobile number."
          : "Type 120 characters or fewer.",
    };
  }
  log.info("member.searched", { results: result.total });
  return { query, items: result.items, total: result.total };
}
