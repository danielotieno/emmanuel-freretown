"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { authPost, failureMessage } from "../_components/auth-api";

type Step = "password" | "code";

/**
 * Staff sign-in (FR-10): email and password, then a code from the authenticator app (or a
 * backup code). A staff member with no authenticator app yet goes on to set one up.
 */
export function SignInForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("password");
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step, backup]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    const result = await authPost("/sign-in/email", {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      rememberMe: false, // the session cookie ends when the browser closes
    });
    setPending(false);
    if (!result.ok) {
      setError(failureMessage(result, "That email address and password don't match."));
      return;
    }
    if (result.data.twoFactorRedirect) {
      setStep("code");
      return;
    }
    // Signed in with a password only: the authenticator app must be set up first.
    router.replace("/enrol");
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    setPending(true);
    setError("");
    const result = await authPost(
      backup ? "/two-factor/verify-backup-code" : "/two-factor/verify-totp",
      { code },
    );
    if (result.ok) {
      router.replace("/");
      return;
    }
    setPending(false);
    // Chosen by Better Auth's error code; nothing the server says is shown.
    const reason = result.data.code;
    if (reason === "INVALID_TWO_FACTOR_COOKIE" || reason === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE") {
      // The sign-in challenge has expired or is used up: only a new password step helps.
      setStep("password");
      setBackup(false);
      setError("That sign-in has expired. Enter your email address and password again.");
      return;
    }
    if (reason === "ACCOUNT_TEMPORARILY_LOCKED") {
      setError("Too many wrong codes. Sign-in is locked for 15 minutes; try again after that.");
      return;
    }
    setError(
      failureMessage(
        result,
        backup
          ? "That backup code didn't work. Check it and try again."
          : "That code didn't work. Check the app and try again.",
      ),
    );
  }

  const errorBox = error ? (
    <p id="sign-in-error" role="alert" className="rounded-xl bg-cloud p-4 text-error">
      {error}
    </p>
  ) : null;

  if (step === "code") {
    return (
      <form onSubmit={verify} className="space-y-5" noValidate>
        <div>
          <label htmlFor="code" className="block font-medium">
            {backup ? "Backup code" : "Code from your authenticator app"}
          </label>
          <input
            ref={codeRef}
            id="code"
            name="code"
            className="field mt-2 tracking-widest tabular-nums"
            inputMode={backup ? "text" : "numeric"}
            autoComplete="one-time-code"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "sign-in-error" : undefined}
          />
        </div>
        {errorBox}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={pending}>
            Sign in
          </button>
          <button
            type="button"
            className="btn-text"
            onClick={() => {
              setBackup(!backup);
              setError("");
            }}
          >
            {backup ? "Use the authenticator app" : "Use a backup code"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={signIn} className="space-y-5" noValidate>
      <div>
        <label htmlFor="email" className="block font-medium">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="field mt-2"
          autoComplete="username"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "sign-in-error" : undefined}
        />
      </div>
      <div>
        <label htmlFor="password" className="block font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          className="field mt-2"
          autoComplete="current-password"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "sign-in-error" : undefined}
        />
      </div>
      {errorBox}
      <button type="submit" className="btn-primary" disabled={pending}>
        Continue
      </button>
    </form>
  );
}
