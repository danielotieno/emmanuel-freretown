CREATE TABLE "sms_daily_usage" (
	"day" date PRIMARY KEY NOT NULL,
	"sent" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sms_daily_usage_sent_check" CHECK ("sms_daily_usage"."sent" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sms_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" text,
	CONSTRAINT "sms_setting_key_check" CHECK ("sms_setting"."key" IN ('daily_cap','low_balance_units')),
	CONSTRAINT "sms_setting_value_check" CHECK ("sms_setting"."value" >= 0)
);
