-- Constraints Drizzle cannot express, exactly as in docs/architecture/database-design.md §2.

CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint

-- A member's HBC periods never overlap (domain-model invariant 2).
ALTER TABLE member_hbc_assignment
  ADD CONSTRAINT member_hbc_assignment_no_overlap
  EXCLUDE USING gist (member_id WITH =, tstzrange(valid_from, valid_to) WITH &&);
--> statement-breakpoint

-- At most one open membership per member per department (domain-model invariant 3).
ALTER TABLE department_membership
  ADD CONSTRAINT department_membership_no_overlap
  EXCLUDE USING gist (member_id WITH =, department_id WITH =,
                      tstzrange(valid_from, valid_to) WITH &&);
--> statement-breakpoint

-- One active grant per user, role and scope; a GLOBAL grant has a null scope_id.
CREATE UNIQUE INDEX role_assignment_active_uq
  ON role_assignment (user_id, role, scope_type, scope_id) NULLS NOT DISTINCT
  WHERE revoked_at IS NULL;
--> statement-breakpoint

-- Registration lifecycle guard (domain-model invariant 7, BR-08, BR-14).
-- * New registrations start SUBMITTED.
-- * reference, channel, capturing officer and creation time never change.
-- * A final registration (APPROVED, REJECTED, WITHDRAWN) keeps its status, decision time
--   and member; only retention redaction may still mark it.
-- * decided_at is always the database clock, so no caller can backdate a decision and make
--   a registration look due for redaction.
CREATE FUNCTION public.registration_guard()
RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'SUBMITTED' THEN
      RAISE EXCEPTION 'a registration must be created as SUBMITTED' USING ERRCODE = 'check_violation';
    END IF;
    NEW.decided_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.channel IS DISTINCT FROM OLD.channel
     OR NEW.captured_by_user_id IS DISTINCT FROM OLD.captured_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'registration % identity fields cannot change', OLD.id USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status IN ('APPROVED','REJECTED','WITHDRAWN') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.decided_at IS DISTINCT FROM OLD.decided_at
       OR NEW.member_id IS DISTINCT FROM OLD.member_id THEN
      RAISE EXCEPTION 'registration % is final', OLD.id USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status IN ('APPROVED','REJECTED','WITHDRAWN') THEN
    NEW.decided_at := now();
  ELSE
    NEW.decided_at := NULL;
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint

CREATE TRIGGER registration_guard
  BEFORE INSERT OR UPDATE ON public.registration
  FOR EACH ROW EXECUTE FUNCTION public.registration_guard();
