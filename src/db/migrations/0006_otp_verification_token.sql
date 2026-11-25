ALTER TABLE "phone_challenge" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "phone_challenge" ADD COLUMN "token_hash" text;--> statement-breakpoint
CREATE UNIQUE INDEX "phone_challenge_token_uq" ON "phone_challenge" USING btree ("token_hash");--> statement-breakpoint
ALTER TABLE "phone_challenge" ADD CONSTRAINT "phone_challenge_token_check" CHECK (("phone_challenge"."verified_at" IS NULL) = ("phone_challenge"."token_hash" IS NULL));--> statement-breakpoint
ALTER TABLE "phone_challenge" ADD CONSTRAINT "phone_challenge_consumed_check" CHECK ("phone_challenge"."consumed_at" IS NULL OR "phone_challenge"."verified_at" IS NOT NULL);