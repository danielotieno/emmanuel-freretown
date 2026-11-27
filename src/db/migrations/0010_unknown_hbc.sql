ALTER TABLE "registration_revision" DROP CONSTRAINT "registration_revision_complete_check";--> statement-breakpoint
ALTER TABLE "registration_revision" ADD CONSTRAINT "registration_revision_complete_check" CHECK ("registration_revision"."redacted_at" IS NOT NULL OR
         ("registration_revision"."full_name" IS NOT NULL AND ("registration_revision"."hbc_id" IS NOT NULL OR "registration_revision"."is_new_member")
          AND ("registration_revision"."phone_e164" IS NOT NULL OR "registration_revision"."no_personal_phone")
          AND ("registration_revision"."fwo_number" IS NOT NULL OR "registration_revision"."is_new_member")));