import Link from "next/link";
import { requireStaff } from "@/app/_lib/staff";
import type { StaffRole } from "@/modules/access";
import { SignOutButton } from "./_components/sign-out-button";

const ROLE_NAMES: Record<StaffRole, string> = {
  SUPER_ADMIN: "Super Administrator",
  MEMBERSHIP_ADMIN: "Membership Administrator",
  REGISTRATION_OFFICER: "Registration Officer",
};

/** Staff home. Any staff member with an active role. */
export default async function AdminHome() {
  const staff = await requireStaff(null);
  const roles = [...new Set(staff.grants.map((g) => ROLE_NAMES[g.role]))];
  // Only to show the link: the desk checks the role itself (CLAUDE.md rule 1).
  const officer = staff.grants.some((g) => g.role === "REGISTRATION_OFFICER");
  const reviewer = staff.grants.some(
    (g) => g.role === "MEMBERSHIP_ADMIN" || g.role === "SUPER_ADMIN",
  );
  return (
    <main className="mx-auto max-w-form px-4 py-10">
      <h1 className="text-4xl">Staff area</h1>
      <p className="mt-4">
        Signed in as {staff.name}. {roles.length === 1 ? "Role" : "Roles"}: {roles.join(", ")}.
      </p>
      {officer && (
        <p className="mt-6">
          {/* A plain link, never <Link>: the desk's Turnstile needs its own page load
              (src/lib/csp.ts). */}
          <a href="/desk" className="btn-primary">
            Open the registration desk
          </a>
        </p>
      )}
      {reviewer && (
        <p className="mt-4">
          <Link href="/review" className="btn-secondary">
            Review queue
          </Link>
        </p>
      )}
      {reviewer && (
        <p className="mt-4">
          <Link href="/members/import" className="btn-secondary">
            Import the parish list
          </Link>
        </p>
      )}
      <div className="mt-8">
        <SignOutButton />
      </div>
    </main>
  );
}
