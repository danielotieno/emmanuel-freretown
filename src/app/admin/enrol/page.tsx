import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireEnrollingStaff } from "@/app/_lib/staff";
import { EnrolForm } from "./enrol-form";
import { AuthFrame } from "../_components/auth-frame";

export const metadata: Metadata = { title: "Set up your authenticator app · Staff" };

/** Only for a staff member signed in with a password who has no authenticator app yet. */
export default async function EnrolPage() {
  const staff = await requireEnrollingStaff();
  if (!staff) redirect("/");
  return (
    <AuthFrame title="Set up your authenticator app">
      <div className="mt-8">
        <EnrolForm />
      </div>
    </AuthFrame>
  );
}
