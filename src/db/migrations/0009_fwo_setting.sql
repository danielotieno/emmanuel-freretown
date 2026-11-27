CREATE TABLE "fwo_setting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"highest_issued" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" text NOT NULL,
	CONSTRAINT "fwo_setting_singleton_check" CHECK ("fwo_setting"."singleton"),
	CONSTRAINT "fwo_setting_highest_issued_check" CHECK ("fwo_setting"."highest_issued" ~ '^[0-9]+$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fwo_setting_singleton_uq" ON "fwo_setting" USING btree ("singleton");--> statement-breakpoint

-- D30 (#101): the highest FWO number ever issued. Set and raised by the application, never
-- deleted, so app_runtime gets SELECT, INSERT and UPDATE. readonly_ops may read it.
GRANT SELECT, INSERT, UPDATE ON fwo_setting TO app_runtime;
--> statement-breakpoint
GRANT SELECT ON fwo_setting TO readonly_ops;
