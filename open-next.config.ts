import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: registry data must never be served stale (ADR 0001, ADR 0002).
export default defineCloudflareConfig({});
