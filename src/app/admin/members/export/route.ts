import { headers } from "next/headers";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { isSameOriginPost } from "@/lib/hosts";
import { exportActiveMembers } from "@/modules/membership";

// Per request: the session, the data and the audit entry are all this request's.
export const dynamic = "force-dynamic";

/** Today in Nairobi, as 2026-11-27, for the file name (database-design.md §1). */
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Nairobi" });

/**
 * The CSV export of active members (FR-12, #25), for Membership Administrators and Super
 * Administrators. A POST from the members page, never a GET: the export writes an audit entry
 * (BR-12), so a link, a prefetch or a page reload must not run it. A POST from any page but the
 * staff portal's own is refused, as Next.js refuses one for a server action: SameSite=Lax lets a
 * form elsewhere on the same site (the public site, staging) post with the staff session. The
 * file is personal data, so it is never cached, and its name carries only the date.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginPost(request.headers)) return new Response("Not found", { status: 404 });
  const staff = await requireStaff("MEMBERSHIP_ADMIN");
  const csv = await exportActiveMembers(await getDb(), {
    actor: { type: "STAFF", userId: staff.userId },
    requestId: (await headers()).get("x-request-id") ?? undefined,
  });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="active-members-${DAY.format(new Date())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
