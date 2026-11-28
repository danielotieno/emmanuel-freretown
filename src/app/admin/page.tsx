import Link from "next/link";
import { requireStaff } from "@/app/_lib/staff";
import { ROLE_NAMES } from "./_components/role-names";
import { SignOutButton } from "./_components/sign-out-button";

/** Staff home. Any staff member with an active role. */
export default async function AdminHome() {
  const staff = await requireStaff(null);
  const roles = [...new Set(staff.grants.map((g) => ROLE_NAMES[g.role]))];
  // Only to show the links: each page checks the role itself (CLAUDE.md rule 1).
  const officer = staff.grants.some((g) => g.role === "REGISTRATION_OFFICER");
  const superAdmin = staff.grants.some((g) => g.role === "SUPER_ADMIN");
  const reviewer = superAdmin || staff.grants.some((g) => g.role === "MEMBERSHIP_ADMIN");
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
      {(officer || reviewer) && (
        <p className="mt-4">
          <Link href="/corrections" className="btn-secondary">
            Corrections
          </Link>
        </p>
      )}
      {reviewer && (
        <p className="mt-4">
          <Link href="/members" className="btn-secondary">
            Members
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
      {reviewer && (
        <p className="mt-4">
          <Link href="/fwo" className="btn-secondary">
            FWO numbers
          </Link>
        </p>
      )}
      {reviewer && (
        <p className="mt-4">
          <Link href="/units" className="btn-secondary">
            HBCs and departments
          </Link>
        </p>
      )}
      {superAdmin && (
        <p className="mt-4">
          <Link href="/audit" className="btn-secondary">
            Audit log
          </Link>
        </p>
      )}
      {superAdmin && (
        <p className="mt-4">
          <Link href="/staff" className="btn-secondary">
            Staff accounts
          </Link>
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <SignOutButton />
        <Link href="/change-password" className="btn-text">
          Change your password
        </Link>
      </div>
    </main>
  );
}
