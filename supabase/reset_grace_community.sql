-- =============================================================================
-- ShepherdsCore Cloud — Reset Test Data for Grace Community Church
-- =============================================================================
-- Deletes all families, members, groups, events, attendance, giving, etc.
-- for the Grace Community Church row. USE WITH CARE — this is destructive.
--
-- Safe order: join tables first, then parents. Saved insights, saved
-- categories, and the church row itself are preserved.
-- =============================================================================

DO $reset$
DECLARE
  v_church_id uuid;
BEGIN
  SELECT id INTO v_church_id FROM public.churches WHERE name ILIKE '%Grace Community%' LIMIT 1;
  IF v_church_id IS NULL THEN
    RAISE EXCEPTION 'No church found matching "Grace Community".';
  END IF;

  RAISE NOTICE 'Resetting church_id=%', v_church_id;

  -- Join tables and dependent rows first
  DELETE FROM public.giving_splits WHERE giving_id IN (SELECT id FROM public.giving WHERE church_id = v_church_id);
  DELETE FROM public.event_attendance WHERE event_id IN (SELECT id FROM public.events WHERE church_id = v_church_id);
  DELETE FROM public.group_members WHERE group_id IN (SELECT id FROM public.groups WHERE church_id = v_church_id);
  DELETE FROM public.bible_study_members WHERE group_id IN (SELECT id FROM public.bible_study_groups WHERE church_id = v_church_id);

  -- Primary tables scoped by church
  DELETE FROM public.giving WHERE church_id = v_church_id;
  DELETE FROM public.attendance WHERE church_id = v_church_id;
  DELETE FROM public.events WHERE church_id = v_church_id;
  DELETE FROM public.groups WHERE church_id = v_church_id;
  DELETE FROM public.bible_study_groups WHERE church_id = v_church_id;
  DELETE FROM public.members WHERE church_id = v_church_id;
  DELETE FROM public.families WHERE church_id = v_church_id;

  RAISE NOTICE 'Reset complete.';
END
$reset$;
