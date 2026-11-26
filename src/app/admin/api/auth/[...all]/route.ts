import { handleAuthRequest } from "@/app/_lib/staff";

// Better Auth's endpoints (sign-in, second factor, sign-out), on the admin host only. The
// middleware never routes the public host into the /admin tree, and handleAuthRequest checks
// the host and Cloudflare Access again.
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return handleAuthRequest(request);
}

export function POST(request: Request): Promise<Response> {
  return handleAuthRequest(request);
}
