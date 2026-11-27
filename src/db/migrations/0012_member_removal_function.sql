-- D45 (#26): one year after a member is marked DECEASED or TRANSFERRED_OUT, their name, phone
-- number and department memberships are removed from the member record and from every
-- revision and audit entry about them. The FWO number is kept, no longer linked to a name, so
-- it is never issued again (D2, BR-02); the status, dates, HBC history and reasons are kept.

-- member: the application may change only the columns its work changes, so that only
-- redact_closed_member() (owner) can set personal_data_redacted_at, and the CHECK
-- member_redacted_check then keeps a removed record without a name or phone.
REVOKE UPDATE ON member FROM app_runtime;
--> statement-breakpoint
GRANT UPDATE (full_name, phone_e164, status, status_reason, language, updated_at, version)
  ON member TO app_runtime;
--> statement-breakpoint

-- Eligibility rests only on what the application cannot backdate: the time of the latest
-- member.change_status audit entry (app_runtime cannot set audit_entry.at), which must have
-- closed the record with its current status. A status set without that entry is never due.
-- Audit entries keep their reasons and statuses: only the personal keys are taken out of
-- before and after (domain-model.md §3, "Reading the log"; the forms tell staff that reasons
-- are kept). Every table is schema-qualified and pg_temp is searched last, as for
-- redact_expired_registration.
CREATE FUNCTION public.redact_closed_member(p_member_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
  v_registration_id uuid;
  v_personal_keys text[] := ARRAY['fullName', 'phoneE164', 'departmentIds'];
BEGIN
  UPDATE public.member m
     SET full_name = NULL, phone_e164 = NULL, personal_data_redacted_at = now(),
         updated_at = now(), version = m.version + 1
   WHERE m.id = p_member_id
     AND m.status IN ('DECEASED', 'TRANSFERRED_OUT')
     AND m.personal_data_redacted_at IS NULL
     AND (SELECT a.after ->> 'status' = m.status AND a.at < now() - interval '1 year'
            FROM public.audit_entry a
           WHERE a.entity_type = 'member'
             AND a.entity_id = m.id::text
             AND a.action = 'member.change_status'
           ORDER BY a.id DESC
           LIMIT 1)
  RETURNING m.source_registration_id INTO v_registration_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'member % is not eligible for removal', p_member_id;
  END IF;

  DELETE FROM public.department_membership WHERE member_id = p_member_id;

  UPDATE public.audit_entry
     SET before = before - v_personal_keys, after = after - v_personal_keys, redacted_at = now()
   WHERE entity_type = 'member' AND entity_id = p_member_id::text;

  -- The registration the member was approved from, if any: its revisions keep the FWO number
  -- and HBC, as the member record does.
  IF v_registration_id IS NOT NULL THEN
    UPDATE public.registration_revision
       SET full_name = NULL, phone_e164 = NULL, redacted_at = now()
     WHERE registration_id = v_registration_id;

    DELETE FROM public.registration_revision_department
     WHERE registration_id = v_registration_id;

    UPDATE public.verification_evidence
       SET phone_e164 = NULL, redacted_at = now()
     WHERE registration_id = v_registration_id;

    UPDATE public.audit_entry
       SET before = before - v_personal_keys, after = after - v_personal_keys,
           redacted_at = now()
     WHERE entity_type = 'registration' AND entity_id = v_registration_id::text;
  END IF;

  INSERT INTO public.audit_entry (actor_type, action, entity_type, entity_id)
  VALUES ('SYSTEM', 'member.redact', 'member', p_member_id::text);
END $$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.redact_closed_member(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.redact_closed_member(uuid) TO app_runtime;
