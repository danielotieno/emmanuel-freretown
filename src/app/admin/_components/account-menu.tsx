"use client";

import { ChevronsUpDown, KeyRound, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clearDeskStorage } from "../desk/values";
import { authPost } from "./auth-api";

/** The first letters of the first and last names, for the round mark beside the name. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = [words[0], words.length > 1 ? words.at(-1) : undefined]
    .map((word) => (word ? [...word][0] : ""))
    .join("");
  return letters.toUpperCase() || "?";
}

/**
 * Who is signed in, and the two things they do to their own account: change the password and
 * sign out. On phones only the round mark shows; the menu names the person.
 */
export function AccountMenu({ name, roles }: { name: string; roles: string[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const role = roles.join(", ");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-full p-1 text-left transition-colors hover:bg-paper data-[state=open]:bg-paper md:rounded-2xl md:p-2">
        <span className="sr-only">Your account: {name}</span>
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-night text-sm font-medium text-paper"
        >
          {initials(name)}
        </span>
        <span aria-hidden="true" className="hidden min-w-0 flex-1 md:block">
          <span className="block truncate text-sm font-medium text-ink">{name}</span>
          <span className="block truncate text-xs text-ink-muted">{role}</span>
        </span>
        <ChevronsUpDown aria-hidden="true" className="mr-1 hidden size-4 text-ink-muted md:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>
          <span className="block font-medium">{name}</span>
          <span className="block text-xs text-ink-muted">{role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/change-password">
            <KeyRound aria-hidden="true" />
            Change your password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending}
          onSelect={async (event) => {
            event.preventDefault();
            setPending(true);
            await authPost("/sign-out");
            // An unfinished desk registration holds a member's details: it goes with the session.
            clearDeskStorage();
            router.replace("/sign-in");
          }}
        >
          <LogOut aria-hidden="true" />
          {pending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
