-- Database roles, privileges and retention redaction (database-design.md §4, BR-14).
-- Migrations run as the owner role. The application connects as a login role that is a
-- member of app_runtime; investigators connect as a member of readonly_ops.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'readonly_ops') THEN
    CREATE ROLE readonly_ops NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO app_runtime, readonly_ops;
--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_ops;
--> statement-breakpoint
-- Investigators never see credentials: password hashes, 2FA secrets, passkeys, session tokens.
REVOKE SELECT ON account, session, verification, two_factor, passkey FROM readonly_ops;
--> statement-breakpoint

GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO app_runtime;
--> statement-breakpoint
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
--> statement-breakpoint

-- UPDATE on mutable tables only. audit_entry, registration_revision,
-- registration_revision_department, registration_decision and verification_evidence are
-- immutable: only redact_expired_registration() (owner) changes them.
GRANT UPDATE ON hbc, department, member, member_hbc_assignment, department_membership,
                phone_challenge, sms_outbox, rate_limit_bucket, role_assignment,
                "user", session, account, verification, two_factor, passkey
  TO app_runtime;
--> statement-breakpoint

-- registration: only the review workflow's columns. reference, channel, captured_by_user_id,
-- created_at and personal_data_redacted_at are never changed by the application
-- (decided_at is listed but always overwritten by the registration_guard trigger).
GRANT UPDATE (status, language, current_revision_no, fwo_conflict, phone_conflict, member_id,
              decided_at, updated_at, version)
  ON registration TO app_runtime;
--> statement-breakpoint

GRANT DELETE ON phone_challenge, rate_limit_bucket, sms_outbox TO app_runtime;
--> statement-breakpoint

-- Better Auth deletes expired sessions and verification tokens, and removes a staff user's
-- second factors and passkeys when they are reset. It needs DELETE on its own tables.
-- (Not listed in database-design.md §4; see the setup pull request.)
GRANT DELETE ON session, verification, account, two_factor, passkey TO app_runtime;
--> statement-breakpoint

REVOKE UPDATE, DELETE ON audit_entry, registration_revision,
                         registration_decision, verification_evidence FROM app_runtime;
--> statement-breakpoint
-- Decisions are timestamped by the database, never by the caller.
REVOKE INSERT ON registration_decision FROM app_runtime;
--> statement-breakpoint
GRANT INSERT (registration_id, action, reason, actor_user_id) ON registration_decision TO app_runtime;
--> statement-breakpoint

-- The application may append audit entries but not choose their time or mark them redacted.
REVOKE INSERT ON audit_entry FROM app_runtime;
--> statement-breakpoint
GRANT INSERT (actor_type, actor_id, action, entity_type, entity_id, before, after, request_id)
  ON audit_entry TO app_runtime;
--> statement-breakpoint

-- Runs as the owner. It decides eligibility only from data the application cannot backdate:
-- decided_at (set by the registration_guard trigger) and the decision row's time (set by the
-- database: app_runtime cannot write registration_decision.at). Every table is
-- schema-qualified and pg_temp is searched last, so a temporary table cannot stand in.
CREATE FUNCTION public.redact_expired_registration(p_registration_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  UPDATE public.registration r
     SET personal_data_redacted_at = now()
   WHERE r.id = p_registration_id
     AND r.status IN ('REJECTED','WITHDRAWN')
     AND r.decided_at < now() - interval '12 months'
     AND r.personal_data_redacted_at IS NULL
     AND EXISTS (
       SELECT 1 FROM public.registration_decision d
        WHERE d.registration_id = r.id
          AND d.action IN ('REJECT','WITHDRAW')
          AND d.at < now() - interval '12 months');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration % is not eligible for redaction', p_registration_id;
  END IF;

  UPDATE public.registration_revision
     SET full_name = NULL, fwo_number = NULL, phone_e164 = NULL,
         hbc_id = NULL, redacted_at = now()
   WHERE registration_id = p_registration_id;

  DELETE FROM public.registration_revision_department WHERE registration_id = p_registration_id;

  UPDATE public.verification_evidence
     SET phone_e164 = NULL, redacted_at = now()
   WHERE registration_id = p_registration_id;

  UPDATE public.audit_entry
     SET before = NULL, after = NULL, redacted_at = now()
   WHERE entity_type = 'registration' AND entity_id = p_registration_id::text;

  INSERT INTO public.audit_entry (actor_type, action, entity_type, entity_id)
  VALUES ('SYSTEM', 'registration.redact', 'registration', p_registration_id::text);
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.redact_expired_registration(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.redact_expired_registration(uuid) TO app_runtime;
