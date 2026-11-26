"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authPost } from "./auth-api";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authPost("/sign-out");
        router.replace("/sign-in");
      }}
    >
      Sign out
    </button>
  );
}
