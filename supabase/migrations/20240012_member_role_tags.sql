-- ============================================================
-- Migration 12: Member role tags
-- Multi-valued tags (e.g. "Bible Study Leader", "Volunteer",
-- "Staff", "Deacon", "Elder") so the directory can be filtered
-- by role. These are distinct from the `status` column
-- (Active / Inactive / Visitor / Deceased / Transferred).
-- ============================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS role_tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_members_role_tags
  ON public.members USING gin(role_tags);
