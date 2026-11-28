ALTER TABLE "user" ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;
-- Staff account management (#91): true while a staff member holds a temporary password from a
-- Super Administrator. app_runtime already has table-level SELECT, INSERT and UPDATE on "user",
-- and readonly_ops SELECT; the flag is not a credential.
