-- Grants and seed for the SMS cap and balance alert (D25, #13, #14). database-design.md §2, §4.

-- The application reads and changes settings and counts each day's SMS; nothing is deleted.
GRANT SELECT, INSERT, UPDATE ON sms_setting, sms_daily_usage TO app_runtime;
--> statement-breakpoint
GRANT SELECT ON sms_setting, sms_daily_usage TO readonly_ops;
--> statement-breakpoint

-- D25: 1,000 SMS per Africa/Nairobi day. Low balance: 1,500 SMS units, about a day and a half
-- at the cap. Administrators can change both.
INSERT INTO sms_setting (key, value) VALUES ('daily_cap', 1000), ('low_balance_units', 1500)
ON CONFLICT (key) DO NOTHING;
