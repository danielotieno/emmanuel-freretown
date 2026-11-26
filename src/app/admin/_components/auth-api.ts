/**
 * Calls one of Better Auth's endpoints on this admin host (src/app/admin/api/auth). Browser
 * only. The session cookie is host-only and HttpOnly; the browser sends it, scripts never see it.
 */
export interface AuthResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

export async function authPost(
  path: string,
  body: Record<string, unknown> = {},
): Promise<AuthResult> {
  try {
    const response = await fetch(`/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, status: response.status, data };
  } catch {
    return { ok: false, status: 0, data: {} };
  }
}

/** A message for a failed call. Never echoes what the server said. */
export function failureMessage(result: AuthResult, fallback: string): string {
  if (result.status === 429) return "Too many attempts. Wait a minute, then try again.";
  if (result.status === 0) return "Couldn't reach the server. Check your connection and try again.";
  return fallback;
}
