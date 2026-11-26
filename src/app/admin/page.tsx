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
  const staff = await requireStaff();
  const roles = [...new Set(staff.grants.map((g) => ROLE_NAMES[g.role]))];
  return (
    <main className="mx-auto max-w-form px-4 py-10">
      <h1 className="text-4xl">Staff area</h1>
      <p className="mt-4">
        Signed in as {staff.name}. {roles.length === 1 ? "Role" : "Roles"}: {roles.join(", ")}.
      </p>
      <p className="mt-2 text-ink-muted">
        The review queue and the registration desk will appear here as they are built.
      </p>
      <div className="mt-8">
        <SignOutButton />
      </div>
    </main>
  );
}
