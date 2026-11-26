CREATE TABLE "staff_rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "staff_rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
DROP TABLE "passkey" CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "two_factor_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Staff authentication (#17). Passkeys are not used: the second factor is an authenticator app
-- (FR-10), so Better Auth's passkey table is gone (it never held a row).
-- staff_rate_limit is Better Auth's rate-limit store for the staff sign-in endpoints. Its keys
-- are an IP address and a path; rows last one rate-limit window and Better Auth prunes them.
GRANT SELECT, INSERT, UPDATE, DELETE ON staff_rate_limit TO app_runtime;
--> statement-breakpoint
GRANT SELECT ON staff_rate_limit TO readonly_ops;
