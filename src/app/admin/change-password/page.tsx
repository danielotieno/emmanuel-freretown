import type { Metadata } from "next";
import Link from "next/link";
import { requirePasswordChange } from "@/app/_lib/staff";
import { CheckIcon } from "@/components/icons";
import { MIN_PASSWORD_LENGTH } from "@/modules/access";
import { ChangePasswordForm } from "./change-password-form";
import { AuthFrame } from "../_components/auth-frame";

export const metadata: Metadata = { title: "Change your password · Staff" };

/**
 * Changing one's own password (FR-10, #91). A staff member holding a temporary password from a
 * Super Administrator is sent here first and can reach nothing else until it is replaced.
 */
export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const staff = await requirePasswordChange();
  const { done } = await searchParams;
  return (
    <AuthFrame title={staff.forced ? "Choose your password" : "Change your password"}>
      {done && !staff.forced ? (
        <>
          <p role="status" className="mt-6 flex gap-3 rounded-xl bg-mist p-4">
            <CheckIcon size="size-5" />
            <span>Password changed. You were signed out on your other devices.</span>
          </p>
          <p className="mt-6">
            <Link href="/" className="btn-secondary">
              Staff home
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="mt-4">
            {staff.forced
              ? "You signed in with a temporary password. Replace it with one only you know before you carry on."
              : "You stay signed in here, and are signed out on your other devices."}{" "}
            Use at least {MIN_PASSWORD_LENGTH} characters; a few unrelated words is a good choice.
          </p>
          <div className="mt-8">
            <ChangePasswordForm forced={staff.forced} />
          </div>
        </>
      )}
    </AuthFrame>
  );
}
