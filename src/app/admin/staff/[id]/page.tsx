import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDb } from "@/app/_lib/db";
import { requireStaff } from "@/app/_lib/staff";
import { AlertIcon, ArrowIcon, CheckIcon } from "@/components/icons";
import { listStaff, STAFF_ROLES } from "@/modules/access";
import { ROLE_NAMES } from "../../_components/role-names";
import {
  grantRoleAction,
  resetSecondFactorAction,
  revokeRoleAction,
  revokeSessionsAction,
} from "../actions";
import { DONE_MESSAGES, REFUSAL_MESSAGES } from "../messages";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Staff account · Staff" };

/**
 * One staff account (FR-10, #91), for Super Administrators: grant and revoke roles, reset a lost
 * authenticator app or a forgotten password, sign them out everywhere. On their own account a
 * Super Administrator may only grant roles (D59). The server actions check everything again.
 */
export default async function StaffAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await requireStaff("SUPER_ADMIN");
  const { id } = await params;
  const [account] = await listStaff(await getDb(), id);
  if (!account) notFound();
  const search = await searchParams;
  const own = account.id === staff.userId;
  const done = messageFor(DONE_MESSAGES, search.done);
  const refused = messageFor(REFUSAL_MESSAGES, search.refused);

  return (
    <main className="min-h-dvh bg-cloud pb-16">
      <div className="mx-auto max-w-prose px-4 pt-4 sm:px-6 sm:pt-8">
        <Link
          href="/staff"
          className="inline-flex min-h-11 items-center gap-2 text-small text-ink-muted hover:text-ink"
        >
          <ArrowIcon className="rotate-180" />
          Staff accounts
        </Link>
        <h1 className="mt-4 text-title">{account.name}</h1>
        <p className="mt-2 break-all text-ink-muted">{account.email}</p>

        {done && (
          <p role="status" className="mt-6 flex gap-3 rounded-xl bg-mist p-4">
            <CheckIcon size="size-5" />
            <span>{done}</span>
          </p>
        )}
        {refused && (
          <p
            role="alert"
            className="mt-6 flex gap-3 rounded-xl border border-error/40 bg-error/5 p-4 text-error"
          >
            <AlertIcon className="mt-1" />
            <span>{refused}</span>
          </p>
        )}

        <dl className="in-card mt-8 divide-y divide-line rounded-2xl border border-line bg-paper text-card">
          <Row label="Password">
            {account.mustChangePassword ? "Temporary: not yet replaced" : "Their own"}
          </Row>
          <Row label="Authenticator app">{account.hasAuthenticator ? "Set up" : "Not set up"}</Row>
          <Row label="Signed in">
            {account.openSessions === 0
              ? "Nowhere"
              : `${account.openSessions} ${account.openSessions === 1 ? "session" : "sessions"}`}
          </Row>
        </dl>

        <section aria-labelledby="roles-heading" className="mt-12">
          <h2 id="roles-heading" className="text-subtitle">
            Roles
          </h2>
          <ul className="in-card mt-3 divide-y divide-line rounded-2xl border border-line bg-paper text-card">
            {STAFF_ROLES.map((role) => {
              const held = account.roles.includes(role);
              return (
                <li
                  key={role}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                >
                  <span className={held ? "" : "text-ink-muted"}>
                    {ROLE_NAMES[role]}
                    {!held && <span> · Not held</span>}
                  </span>
                  {(!held || !own) && (
                    <form action={held ? revokeRoleAction : grantRoleAction}>
                      <input type="hidden" name="userId" value={account.id} />
                      <input type="hidden" name="role" value={role} />
                      <button type="submit" className="btn-text">
                        {held ? "Revoke" : "Grant"}
                        <span className="sr-only"> {ROLE_NAMES[role]}</span>
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="access-heading" className="mt-12">
          <h2 id="access-heading" className="text-subtitle">
            Signing in
          </h2>
          {own ? (
            <p className="mt-3">
              This is your account. Another Super Administrator resets its authenticator app or
              password. <Link href="/change-password">Change your password</Link>.
            </p>
          ) : (
            <div className="in-card mt-3 divide-y divide-line rounded-2xl border border-line bg-paper text-card">
              <Confirm summary="Reset their authenticator app">
                <p>
                  For a lost or replaced phone. This removes the app and its backup codes, and signs
                  them out everywhere. At their next sign-in, with their password, they set up an
                  app again.
                </p>
                <ButtonForm action={resetSecondFactorAction} userId={account.id}>
                  Remove the authenticator app
                </ButtonForm>
              </Confirm>
              <Confirm summary="Reset their password">
                <p>
                  For a forgotten password. This gives them a new temporary password and signs them
                  out everywhere. They choose their own at their next sign-in.
                </p>
                <ResetPasswordForm userId={account.id} name={account.name} />
              </Confirm>
              <Confirm summary="Sign them out everywhere">
                <p>
                  Ends every session they have, for example when they leave. They can sign in again
                  while they hold a role and are on the Cloudflare Access allow-list.
                </p>
                <ButtonForm action={revokeSessionsAction} userId={account.id}>
                  Sign them out
                </ButtonForm>
              </Confirm>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/** The message for a code in the URL; own keys only, so `?done=constructor` finds nothing. */
function messageFor(messages: Record<string, string>, code: unknown): string | undefined {
  return typeof code === "string" && Object.hasOwn(messages, code) ? messages[code] : undefined;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-5 py-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A change that needs a second click: the summary opens an explanation and the button. */
function Confirm({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="px-5 py-3">
      <summary className="btn-text -ml-2 cursor-pointer list-none">{summary}</summary>
      <div className="space-y-3 pt-2 pb-2">{children}</div>
    </details>
  );
}

function ButtonForm(props: {
  action: (form: FormData) => Promise<void>;
  userId: string;
  children: string;
}) {
  return (
    <form action={props.action}>
      <input type="hidden" name="userId" value={props.userId} />
      <button type="submit" className="btn-secondary">
        {props.children}
      </button>
    </form>
  );
}
