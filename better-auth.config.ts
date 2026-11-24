// Used only by the Better Auth CLI (`pnpm auth:schema`) to generate src/db/schema/auth.ts.
// The running app builds its auth instance per request with createAuth().
import { drizzle } from "drizzle-orm/node-postgres";
import { createAuth } from "./src/modules/access/auth";
import * as schema from "./src/db/schema";

export const auth = createAuth({
  db: drizzle.mock({ schema }),
  secret: "cli-schema-generation-only-not-a-real-secret",
  baseURL: "https://admin.ackemmanuelfreretown.org",
});
