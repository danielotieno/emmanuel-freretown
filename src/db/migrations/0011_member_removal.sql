ALTER TABLE "member" DROP CONSTRAINT "member_full_name_check";--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "full_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "personal_data_redacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_redacted_check" CHECK (("member"."personal_data_redacted_at" IS NULL AND "member"."full_name" IS NOT NULL) OR ("member"."personal_data_redacted_at" IS NOT NULL AND "member"."full_name" IS NULL AND "member"."phone_e164" IS NULL));--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_full_name_check" CHECK ("member"."full_name" IS NULL OR length(btrim("member"."full_name")) BETWEEN 2 AND 120);