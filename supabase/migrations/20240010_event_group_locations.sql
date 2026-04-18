-- ============================================================
-- Migration 10: Add location to events and groups
-- (bible_study_groups already has location from migration 5)
-- ============================================================

ALTER TABLE public.events  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';
ALTER TABLE public.groups  ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';
