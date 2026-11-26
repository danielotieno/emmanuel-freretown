import type { Metadata } from "next";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · Staff" };

/**
 * Staff sign-in. Open to anyone who got past Cloudflare Access; the form only talks to Better
 * Auth's endpoints, which check everything themselves.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ timeout?: string }>;
}) {
  const { timeout } = await searchParams;
  return (
    <main className="mx-auto max-w-form px-4 py-10">
      <h1 className="text-4xl">Staff sign-in</h1>
      {timeout ? (
        <p className="mt-4 rounded-xl bg-lagoon p-4">
          You were signed out because the page was left idle. Sign in again to carry on.
        </p>
      ) : null}
      <div className="mt-8">
        <SignInForm />
      </div>
    </main>
  );
}
