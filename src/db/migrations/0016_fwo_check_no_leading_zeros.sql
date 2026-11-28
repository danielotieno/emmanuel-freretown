ALTER TABLE "member" DROP CONSTRAINT "member_fwo_number_check";--> statement-breakpoint
ALTER TABLE "fwo_setting" DROP CONSTRAINT "fwo_setting_highest_issued_check";--> statement-breakpoint
ALTER TABLE "registration_revision" DROP CONSTRAINT "registration_revision_fwo_number_check";--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_fwo_number_check" CHECK ("member"."fwo_number" ~ '^(0|[1-9][0-9]*)$');--> statement-breakpoint
ALTER TABLE "fwo_setting" ADD CONSTRAINT "fwo_setting_highest_issued_check" CHECK ("fwo_setting"."highest_issued" ~ '^(0|[1-9][0-9]*)$');--> statement-breakpoint
ALTER TABLE "registration_revision" ADD CONSTRAINT "registration_revision_fwo_number_check" CHECK ("registration_revision"."fwo_number" IS NULL OR "registration_revision"."fwo_number" ~ '^(0|[1-9][0-9]*)$');