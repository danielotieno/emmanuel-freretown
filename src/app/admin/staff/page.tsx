import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { listStaff, type StaffAccount } from "@/modules/access";
import { ROLE_NAMES } from "../_components/role-names";
import { CreateStaffForm } from "./create-form";
import { StaffShell } from "../_components/staff-shell";

export const metadata: Metadata = { title: "Staff accounts · Staff" };

/**
 * Staff accounts (FR-10, #91), for Super Administrators only: every staff user with their
 * roles, and a form to add one. Viewing the list is not recorded (D31); every change is audited
 * by the access module.
 */
export default async function StaffPage() {
  const staff = await requireStaff("SUPER_ADMIN");
  const accounts = await listStaff(await getDb());

  return (
    <StaffShell staff={staff} current="staff" width="prose">
      <h1 className="text-title">Staff accounts</h1>
      <p className="mt-2 text-ink-muted">
        Everyone who can sign in to the staff area. To remove someone, revoke their roles, sign them
        out everywhere, and take them off the Cloudflare Access allow-list. Every change is recorded
        in the audit log.
      </p>

      <ul className="in-card mt-8 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-paper text-card">
        {accounts.map((a) => (
          <li key={a.id}>
            <Link
              href={`/staff/${encodeURIComponent(a.id)}`}
              className="block px-5 py-4 hover:bg-cloud"
            >
              <span className="block text-ink">{a.name}</span>
              <span className="block text-small text-ink-muted">{summary(a)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="add-heading" className="mt-12">
        <h2 id="add-heading" className="text-subtitle">
          Add a staff member
        </h2>
        <div className="in-card mt-3 rounded-2xl border border-line bg-paper p-5 text-card sm:p-6">
          <CreateStaffForm />
        </div>
      </section>
    </StaffShell>
  );
}

/** Roles, or that there are none, and a step they have yet to take. */
function summary(a: StaffAccount): string {
  const roles = a.roles.length ? a.roles.map((r) => ROLE_NAMES[r]).join(", ") : "No roles";
  if (a.mustChangePassword) return `${roles} · Temporary password`;
  if (!a.hasAuthenticator) return `${roles} · No authenticator app yet`;
  return roles;
}
