CREATE TABLE "role_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"scope_type" text DEFAULT 'GLOBAL' NOT NULL,
	"scope_id" uuid,
	"granted_by_user_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "role_assignment_role_check" CHECK ("role_assignment"."role" IN ('SUPER_ADMIN','MEMBERSHIP_ADMIN','REGISTRATION_OFFICER')),
	CONSTRAINT "role_assignment_scope_type_check" CHECK ("role_assignment"."scope_type" IN ('GLOBAL','HBC','DEPARTMENT')),
	CONSTRAINT "role_assignment_scope_check" CHECK (("role_assignment"."scope_type" = 'GLOBAL') = ("role_assignment"."scope_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "audit_entry" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_entry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"request_id" text,
	"redacted_at" timestamp with time zone,
	CONSTRAINT "audit_entry_actor_type_check" CHECK ("audit_entry"."actor_type" IN ('STAFF','PUBLIC','SYSTEM'))
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone,
	"aaguid" text
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"two_factor_enabled" boolean DEFAULT false,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"state" text NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"confirmed_by_user_id" text,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "department_membership_state_check" CHECK ("department_membership"."state" IN ('DECLARED','CONFIRMED')),
	CONSTRAINT "department_membership_period_check" CHECK ("department_membership"."valid_to" IS NULL OR "department_membership"."valid_to" > "department_membership"."valid_from"),
	CONSTRAINT "department_membership_confirmed_check" CHECK (("department_membership"."state" = 'CONFIRMED') = ("department_membership"."confirmed_at" IS NOT NULL AND "department_membership"."confirmed_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fwo_number" text NOT NULL,
	"full_name" text NOT NULL,
	"phone_e164" text,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"status_reason" text,
	"language" text DEFAULT 'sw' NOT NULL,
	"source_registration_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "member_fwo_number_check" CHECK ("member"."fwo_number" ~ '^[0-9]+$'),
	CONSTRAINT "member_full_name_check" CHECK (length(btrim("member"."full_name")) BETWEEN 2 AND 120),
	CONSTRAINT "member_phone_e164_check" CHECK ("member"."phone_e164" ~ '^\+254[17][0-9]{8}$'),
	CONSTRAINT "member_status_check" CHECK ("member"."status" IN ('ACTIVE','INACTIVE','DECEASED','TRANSFERRED_OUT')),
	CONSTRAINT "member_language_check" CHECK ("member"."language" IN ('en','sw')),
	CONSTRAINT "member_status_reason_check" CHECK ("member"."status" = 'ACTIVE' OR "member"."status_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "member_hbc_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"hbc_id" uuid NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	CONSTRAINT "member_hbc_assignment_period_check" CHECK ("member_hbc_assignment"."valid_to" IS NULL OR "member_hbc_assignment"."valid_to" > "member_hbc_assignment"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "sms_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"template" text NOT NULL,
	"language" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_message_id" text,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "sms_outbox_phone_e164_check" CHECK ("sms_outbox"."phone_e164" ~ '^\+254[17][0-9]{8}$'),
	CONSTRAINT "sms_outbox_language_check" CHECK ("sms_outbox"."language" IN ('en','sw')),
	CONSTRAINT "sms_outbox_status_check" CHECK ("sms_outbox"."status" IN ('PENDING','SENT','DELIVERED','FAILED'))
);
--> statement-breakpoint
CREATE TABLE "department" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "department_name_check" CHECK (length(btrim("department"."name")) BETWEEN 2 AND 80)
);
--> statement-breakpoint
CREATE TABLE "hbc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hbc_name_check" CHECK (length(btrim("hbc"."name")) BETWEEN 2 AND 80)
);
--> statement-breakpoint
CREATE TABLE "rate_limit_bucket" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_bucket_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "registration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'SUBMITTED' NOT NULL,
	"language" text NOT NULL,
	"current_revision_no" integer DEFAULT 1 NOT NULL,
	"captured_by_user_id" text,
	"event_label" text,
	"fwo_conflict" boolean DEFAULT false NOT NULL,
	"phone_conflict" boolean DEFAULT false NOT NULL,
	"member_id" uuid,
	"decided_at" timestamp with time zone,
	"personal_data_redacted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "registration_reference_check" CHECK ("registration"."reference" ~ '^REG-[2-9A-HJ-NP-Z]{5}$'),
	CONSTRAINT "registration_channel_check" CHECK ("registration"."channel" IN ('SELF','ASSISTED')),
	CONSTRAINT "registration_status_check" CHECK ("registration"."status" IN ('SUBMITTED','CORRECTION_REQUESTED','APPROVED','REJECTED','WITHDRAWN')),
	CONSTRAINT "registration_language_check" CHECK ("registration"."language" IN ('en','sw')),
	CONSTRAINT "registration_captured_by_check" CHECK (("registration"."channel" = 'ASSISTED') = ("registration"."captured_by_user_id" IS NOT NULL)),
	CONSTRAINT "registration_member_check" CHECK (("registration"."status" = 'APPROVED') = ("registration"."member_id" IS NOT NULL)),
	CONSTRAINT "registration_decided_check" CHECK (("registration"."status" IN ('APPROVED','REJECTED','WITHDRAWN')) = ("registration"."decided_at" IS NOT NULL)),
	CONSTRAINT "registration_redaction_check" CHECK ("registration"."personal_data_redacted_at" IS NULL OR "registration"."status" IN ('REJECTED','WITHDRAWN'))
);
--> statement-breakpoint
CREATE TABLE "registration_decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"actor_user_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_decision_action_check" CHECK ("registration_decision"."action" IN ('APPROVE','REJECT','REQUEST_CORRECTION','WITHDRAW')),
	CONSTRAINT "registration_decision_reason_check" CHECK ("registration_decision"."action" = 'APPROVE' OR "registration_decision"."reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "registration_revision" (
	"registration_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"full_name" text,
	"fwo_number" text,
	"phone_e164" text,
	"hbc_id" uuid,
	"adult_declared" boolean NOT NULL,
	"transfer_consent" boolean NOT NULL,
	"is_new_member" boolean DEFAULT false NOT NULL,
	"no_personal_phone" boolean DEFAULT false NOT NULL,
	"privacy_notice_version" text NOT NULL,
	"submitted_by_user_id" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redacted_at" timestamp with time zone,
	CONSTRAINT "registration_revision_registration_id_revision_no_pk" PRIMARY KEY("registration_id","revision_no"),
	CONSTRAINT "registration_revision_revision_no_check" CHECK ("registration_revision"."revision_no" >= 1),
	CONSTRAINT "registration_revision_full_name_check" CHECK ("registration_revision"."full_name" IS NULL OR length(btrim("registration_revision"."full_name")) BETWEEN 2 AND 120),
	CONSTRAINT "registration_revision_fwo_number_check" CHECK ("registration_revision"."fwo_number" IS NULL OR "registration_revision"."fwo_number" ~ '^[0-9]+$'),
	CONSTRAINT "registration_revision_phone_e164_check" CHECK ("registration_revision"."phone_e164" IS NULL OR "registration_revision"."phone_e164" ~ '^\+254[17][0-9]{8}$'),
	CONSTRAINT "registration_revision_adult_declared_check" CHECK ("registration_revision"."adult_declared"),
	CONSTRAINT "registration_revision_transfer_consent_check" CHECK ("registration_revision"."transfer_consent"),
	CONSTRAINT "registration_revision_no_phone_check" CHECK (NOT ("registration_revision"."no_personal_phone" AND "registration_revision"."phone_e164" IS NOT NULL)),
	CONSTRAINT "registration_revision_no_phone_officer_check" CHECK (NOT "registration_revision"."no_personal_phone" OR "registration_revision"."submitted_by_user_id" IS NOT NULL),
	CONSTRAINT "registration_revision_complete_check" CHECK ("registration_revision"."redacted_at" IS NOT NULL OR
         ("registration_revision"."full_name" IS NOT NULL AND "registration_revision"."hbc_id" IS NOT NULL
          AND ("registration_revision"."phone_e164" IS NOT NULL OR "registration_revision"."no_personal_phone")
          AND ("registration_revision"."fwo_number" IS NOT NULL OR "registration_revision"."is_new_member")))
);
--> statement-breakpoint
CREATE TABLE "registration_revision_department" (
	"registration_id" uuid NOT NULL,
	"revision_no" integer NOT NULL,
	"department_id" uuid NOT NULL,
	CONSTRAINT "registration_revision_department_registration_id_revision_no_department_id_pk" PRIMARY KEY("registration_id","revision_no","department_id")
);
--> statement-breakpoint
CREATE TABLE "phone_challenge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_e164" text NOT NULL,
	"purpose" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "phone_challenge_phone_e164_check" CHECK ("phone_challenge"."phone_e164" ~ '^\+254[17][0-9]{8}$'),
	CONSTRAINT "phone_challenge_purpose_check" CHECK ("phone_challenge"."purpose" IN ('REGISTRATION','STATUS_CHECK')),
	CONSTRAINT "phone_challenge_attempts_check" CHECK ("phone_challenge"."attempts" BETWEEN 0 AND 5)
);
--> statement-breakpoint
CREATE TABLE "verification_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"phone_e164" text,
	"actor_user_id" text,
	"event_label" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"redacted_at" timestamp with time zone,
	CONSTRAINT "verification_evidence_kind_check" CHECK ("verification_evidence"."kind" IN ('PHONE_OTP','IN_PERSON','FWO_CONFIRMED_BY_SECRETARY')),
	CONSTRAINT "verification_evidence_phone_check" CHECK ("verification_evidence"."kind" <> 'PHONE_OTP' OR "verification_evidence"."phone_e164" IS NOT NULL OR "verification_evidence"."redacted_at" IS NOT NULL),
	CONSTRAINT "verification_evidence_actor_check" CHECK ("verification_evidence"."kind" = 'PHONE_OTP' OR "verification_evidence"."actor_user_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_membership" ADD CONSTRAINT "department_membership_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_membership" ADD CONSTRAINT "department_membership_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_source_registration_id_registration_id_fk" FOREIGN KEY ("source_registration_id") REFERENCES "public"."registration"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_hbc_assignment" ADD CONSTRAINT "member_hbc_assignment_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_hbc_assignment" ADD CONSTRAINT "member_hbc_assignment_hbc_id_hbc_id_fk" FOREIGN KEY ("hbc_id") REFERENCES "public"."hbc"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration" ADD CONSTRAINT "registration_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_decision" ADD CONSTRAINT "registration_decision_registration_id_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registration"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_revision" ADD CONSTRAINT "registration_revision_registration_id_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registration"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_revision" ADD CONSTRAINT "registration_revision_hbc_id_hbc_id_fk" FOREIGN KEY ("hbc_id") REFERENCES "public"."hbc"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_revision_department" ADD CONSTRAINT "registration_revision_department_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_revision_department" ADD CONSTRAINT "registration_revision_department_revision_fk" FOREIGN KEY ("registration_id","revision_no") REFERENCES "public"."registration_revision"("registration_id","revision_no") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_evidence" ADD CONSTRAINT "verification_evidence_registration_id_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registration"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_entry_entity_idx" ON "audit_entry" USING btree ("entity_type","entity_id","at");--> statement-breakpoint
CREATE INDEX "audit_entry_actor_idx" ON "audit_entry" USING btree ("actor_id","at");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_userId_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credentialID_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "twoFactor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "twoFactor_userId_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "member_fwo_uq" ON "member" USING btree ("fwo_number");--> statement-breakpoint
CREATE UNIQUE INDEX "member_phone_uq" ON "member" USING btree ("phone_e164") WHERE "member"."phone_e164" IS NOT NULL AND "member"."status" IN ('ACTIVE','INACTIVE');--> statement-breakpoint
CREATE UNIQUE INDEX "member_hbc_one_open_uq" ON "member_hbc_assignment" USING btree ("member_id") WHERE "member_hbc_assignment"."valid_to" IS NULL;--> statement-breakpoint
CREATE INDEX "member_hbc_by_hbc_idx" ON "member_hbc_assignment" USING btree ("hbc_id") WHERE "member_hbc_assignment"."valid_to" IS NULL;--> statement-breakpoint
CREATE INDEX "sms_outbox_pending_idx" ON "sms_outbox" USING btree ("created_at") WHERE "sms_outbox"."status" = 'PENDING';--> statement-breakpoint
CREATE UNIQUE INDEX "department_name_uq" ON "department" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "hbc_name_uq" ON "hbc" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "registration_reference_uq" ON "registration" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "registration_queue_idx" ON "registration" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "registration_decision_reg_idx" ON "registration_decision" USING btree ("registration_id","at");--> statement-breakpoint
CREATE INDEX "registration_revision_fwo_idx" ON "registration_revision" USING btree ("fwo_number");--> statement-breakpoint
CREATE INDEX "phone_challenge_rate_idx" ON "phone_challenge" USING btree ("phone_e164","created_at");--> statement-breakpoint
CREATE INDEX "verification_evidence_reg_idx" ON "verification_evidence" USING btree ("registration_id");