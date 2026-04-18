-- =============================================================================
-- ShepherdsCore Cloud — Reset Test Data for Grace Community Church
-- =============================================================================
-- Deletes all families, members, groups, events, attendance, giving, etc.
-- for the Grace Community Church row. USE WITH CARE — this is destructive.
--
-- Safe order: join tables first, then parents. Saved insights, saved
-- categories, and the church row itself are preserved.
--
-- This script is tolerant of tables that don't exist in older schemas
-- (e.g. giving_splits, bible_study_groups, saved_insights) so you can run
-- it even if not every migration has been applied yet.
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

  -- Join tables and dependent rows first ---------------------------------
  IF to_regclass('public.giving_splits') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.giving_splits WHERE giving_id IN (SELECT id FROM public.giving WHERE church_id = $1)' USING v_church_id;
  END IF;
  IF to_regclass('public.event_attendance') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.event_attendance WHERE event_id IN (SELECT id FROM public.events WHERE church_id = $1)' USING v_church_id;
  END IF;
  IF to_regclass('public.group_members') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.group_members WHERE group_id IN (SELECT id FROM public.groups WHERE church_id = $1)' USING v_church_id;
  END IF;
  IF to_regclass('public.bible_study_members') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.bible_study_members WHERE group_id IN (SELECT id FROM public.bible_study_groups WHERE church_id = $1)' USING v_church_id;
  END IF;

  -- Primary tables scoped by church --------------------------------------
  IF to_regclass('public.giving') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.giving WHERE church_id = $1' USING v_church_id;
  END IF;
  IF to_regclass('public.attendance') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.attendance WHERE church_id = $1' USING v_church_id;
  END IF;
  IF to_regclass('public.events') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.events WHERE church_id = $1' USING v_church_id;
  END IF;
  IF to_regclass('public.groups') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.groups WHERE church_id = $1' USING v_church_id;
  END IF;
  IF to_regclass('public.bible_study_groups') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.bible_study_groups WHERE church_id = $1' USING v_church_id;
  END IF;
  IF to_regclass('public.members') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.members WHERE church_id = $1' USING v_church_id;
  END IF;
  IF to_regclass('public.families') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.families WHERE church_id = $1' USING v_church_id;
  END IF;

  RAISE NOTICE 'Reset complete.';
END
$reset$;
