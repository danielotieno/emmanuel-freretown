import Link from "next/link";
import type { MemberListItem } from "@/modules/membership";
import { REMOVED_NAME, STATUS_NAMES } from "./names";

/** Members as links to their records (FR-6). Shared by the list and the search results. */
export function MemberList({ items }: { items: MemberListItem[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="in-card mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper text-card">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`/members/${item.id}`}
            className="grid gap-1 px-5 py-4 hover:bg-mist sm:grid-cols-12 sm:items-center sm:gap-4"
          >
            <span className={`sm:col-span-5 ${item.fullName ? "" : "text-ink-muted"}`}>
              {item.fullName ?? REMOVED_NAME}
            </span>
            <span className="text-ink-muted tabular-nums sm:col-span-2">{item.fwoNumber}</span>
            <span className="text-ink-muted sm:col-span-3">{item.hbcName}</span>
            <span className="text-small text-ink-muted sm:col-span-2">
              {STATUS_NAMES[item.status]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
