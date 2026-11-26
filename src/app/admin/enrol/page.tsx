import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireEnrollingStaff } from "@/app/_lib/staff";
import { EnrolForm } from "./enrol-form";

export const metadata: Metadata = { title: "Set up your authenticator app · Staff" };

/** Only for a staff member signed in with a password who has no authenticator app yet. */
export default async function EnrolPage() {
  const staff = await requireEnrollingStaff();
  if (!staff) redirect("/");
  return (
    <main className="mx-auto max-w-form px-4 py-10">
      <h1 className="text-4xl">Set up your authenticator app</h1>
      <div className="mt-8">
        <EnrolForm />
      </div>
    </main>
  );
}
