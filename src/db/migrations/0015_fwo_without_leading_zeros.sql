-- D61 (#156, #155): leading zeros in FWO numbers don't count, so "054" and "54" are the same
-- number, stored as "54" (a number of zeros only as "0"). This rewrites the numbers already
-- stored in that form, on members, on every revision and in the highest-issued setting (D30);
-- the next migration then makes the CHECKs refuse a leading zero. Revisions are otherwise never
-- changed, but every lookup now reads numbers without their zeros: an open registration's
-- conflict checks, the status check by reference and D2's "issued before" check must all find
-- the same form. Earlier audit entries keep the numbers as they were recorded.
--
-- Two members whose numbers differ only by leading zeros would now hold one number, which
-- member_fwo_uq refuses: the migration stops, with a message that names no number (the deploy
-- log is public), until a Membership Administrator decides which of them keeps it (BR-02). Open
-- registrations that now share a number aren't flagged here; approval checks again (BR-03).
--
-- One SYSTEM audit entry records the rewrite (rule 4), with counts only.
DO $$
DECLARE
  v_members integer;
  v_revisions integer;
  v_setting integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.member GROUP BY ltrim(fwo_number, '0') HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Some members'' FWO numbers differ only by leading zeros (D61). Resolve them before migrating.';
  END IF;

  UPDATE public.member
     SET fwo_number = COALESCE(NULLIF(ltrim(fwo_number, '0'), ''), '0')
   WHERE fwo_number LIKE '0_%';
  GET DIAGNOSTICS v_members = ROW_COUNT;

  UPDATE public.registration_revision
     SET fwo_number = COALESCE(NULLIF(ltrim(fwo_number, '0'), ''), '0')
   WHERE fwo_number LIKE '0_%';
  GET DIAGNOSTICS v_revisions = ROW_COUNT;

  UPDATE public.fwo_setting
     SET highest_issued = COALESCE(NULLIF(ltrim(highest_issued, '0'), ''), '0')
   WHERE highest_issued LIKE '0_%';
  GET DIAGNOSTICS v_setting = ROW_COUNT;

  INSERT INTO public.audit_entry (actor_type, action, entity_type, entity_id, after)
  VALUES ('SYSTEM', 'member.drop_fwo_leading_zeros', 'member', '*',
          jsonb_build_object('members', v_members, 'revisions', v_revisions,
                             'setting', v_setting));
END $$;
