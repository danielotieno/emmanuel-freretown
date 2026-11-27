CREATE TABLE "member_import" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"imported_by_user_id" text NOT NULL,
	"consent_confirmed_on" date NOT NULL,
	"privacy_notice_version" text NOT NULL,
	"rows_imported" integer NOT NULL,
	"rows_skipped" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_import_rows_imported_check" CHECK ("member_import"."rows_imported" > 0),
	CONSTRAINT "member_import_rows_skipped_check" CHECK ("member_import"."rows_skipped" >= 0)
);
--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_import_id_member_import_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."member_import"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_source_check" CHECK ("member"."source_registration_id" IS NULL OR "member"."import_id" IS NULL);--> statement-breakpoint

-- Import of the parish list (#104, FR-13, D47). member_import records who imported how many
-- rows on whose consent confirmation; it is inserted, never changed, so app_runtime gets
-- SELECT and INSERT only. readonly_ops may read it: it holds no credentials.
GRANT SELECT, INSERT ON member_import TO app_runtime;
--> statement-breakpoint
GRANT SELECT ON member_import TO readonly_ops;
