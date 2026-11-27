/**
 * A temporary password, shown once to the Super Administrator to hand over in person (#91). It
 * is never stored except as a hash, so leaving the page loses it: a new one means a reset.
 */
export function TemporaryPassword({ name, password }: { name: string; password: string }) {
  return (
    <div role="status" className="space-y-3 rounded-xl bg-mist p-4">
      <p>
        Give {name} this temporary password in person or by phone call, not by SMS or email. It is
        shown only once.
      </p>
      <p className="font-mono text-lg tracking-wider break-all select-all">{password}</p>
      <p className="text-small text-ink-muted">
        At their first sign-in they choose their own password, then set up an authenticator app.
      </p>
    </div>
  );
}
