"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { encode } from "uqr";
import { authPost, failureMessage } from "../_components/auth-api";

interface Setup {
  totpURI: string;
  backupCodes: string[];
}

/** The QR code for the authenticator app, drawn as one SVG path (no HTML injection). */
function QrCode({ text }: { text: string }) {
  const { data, size } = encode(text, { ecc: "M", border: 2 });
  let d = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="h-56 w-56 rounded-xl border border-line bg-paper"
      role="img"
      aria-label="QR code for your authenticator app"
      shapeRendering="crispEdges"
    >
      <path d={d} fill="currentColor" className="text-ink" />
    </svg>
  );
}

/** The secret from an otpauth:// URI, in groups of four for typing. */
function setupKey(totpURI: string): string {
  const secret = new URL(totpURI).searchParams.get("secret") ?? "";
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Setting up the authenticator app (FR-10): confirm the password, scan the QR code (or type the
 * setup key), keep the backup codes, then enter a code to prove it works. Until this is done the
 * staff member can reach nothing else.
 */
export function EnrolForm() {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (setup) headingRef.current?.focus();
  }, [setup]);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setPending(true);
    setError("");
    const result = await authPost("/two-factor/enable", { password, method: "totp" });
    setPending(false);
    const { totpURI, backupCodes } = result.data;
    if (!result.ok || typeof totpURI !== "string" || !Array.isArray(backupCodes)) {
      setError(failureMessage(result, "That password isn't right."));
      return;
    }
    setSetup({ totpURI, backupCodes: backupCodes.map(String) });
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    setPending(true);
    setError("");
    const result = await authPost("/two-factor/verify-totp", { code });
    if (result.ok) {
      router.replace("/");
      return;
    }
    setPending(false);
    setError(failureMessage(result, "That code didn't work. Check the app and try again."));
  }

  const errorBox = error ? (
    <p id="enrol-error" role="alert" className="rounded-xl bg-cloud p-4 text-error">
      {error}
    </p>
  ) : null;

  if (!setup) {
    return (
      <form onSubmit={start} className="space-y-5" noValidate>
        <p>
          Staff sign in with a password and a code from an authenticator app, such as Google
          Authenticator or Microsoft Authenticator. Install one on your phone, then confirm your
          password to begin.
        </p>
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
            aria-describedby={error ? "enrol-error" : undefined}
          />
        </div>
        {errorBox}
        <button type="submit" className="btn-primary" disabled={pending}>
          Continue
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-8" noValidate>
      <section className="space-y-4">
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl outline-none">
          1. Add this account to the app
        </h2>
        <p>In the authenticator app, add an account and scan this code.</p>
        <QrCode text={setup.totpURI} />
        <p className="text-sm text-ink-muted">
          Can&apos;t scan it? Choose to enter a setup key, and type:
        </p>
        <p className="font-mono text-lg tracking-wider break-all">{setupKey(setup.totpURI)}</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl">2. Keep your backup codes</h2>
        <p>
          If you lose your phone, each of these codes signs you in once. Write them down and keep
          them somewhere safe and private. They won&apos;t be shown again.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-xl bg-cloud p-4 font-mono tabular-nums sm:grid-cols-3">
          {setup.backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl">3. Enter a code from the app</h2>
        <div>
          <label htmlFor="code" className="block font-medium">
            6-digit code
          </label>
          <input
            id="code"
            name="code"
            className="field mt-2 tracking-widest tabular-nums"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "enrol-error" : undefined}
          />
        </div>
        {errorBox}
        <button type="submit" className="btn-primary" disabled={pending}>
          Finish setting up
        </button>
      </section>
    </form>
  );
}
