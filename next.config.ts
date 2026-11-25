import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // `next dev` would print each server action's arguments: form values, which can be personal
  // data (CLAUDE.md rule 2). Production never logs them; this keeps development quiet too.
  logging: { serverFunctions: false },
  // Local admin portal: http://admin.localhost:3000 (see src/middleware.ts).
  allowedDevOrigins: ["admin.localhost"],
  // DESIGN.md §5: images are pre-optimised static files; no next/image optimisation on Cloudflare.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;

// Lets `next dev` read Cloudflare bindings (Hyperdrive etc.) from wrangler.jsonc.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
void initOpenNextCloudflareForDev();
