import { defineConfig } from "drizzle-kit";

// Load .env for local work; CI and deploy pass DATABASE_URL directly.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file
}

// Migrations run as the owner role (database-design.md §4), never as app_runtime.
// Never use `drizzle-kit push` against staging or production (CLAUDE.md rule 6).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
