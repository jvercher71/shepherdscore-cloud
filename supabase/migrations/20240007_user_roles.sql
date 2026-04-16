-- ============================================================
-- Migration 7: User roles & staff management
-- Tracks which auth users belong to a church and their role
-- ============================================================

CREATE TABLE IF NOT EXISTS public.church_staff (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  email      text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role       text NOT NULL DEFAULT 'View-Only',  -- Admin | Staff | View-Only
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login timestamptz,
  UNIQUE(church_id, user_id),
  UNIQUE(church_id, email)
);

CREATE INDEX IF NOT EXISTS idx_church_staff_church ON public.church_staff(church_id);
CREATE INDEX IF NOT EXISTS idx_church_staff_user ON public.church_staff(user_id);

ALTER TABLE public.church_staff ENABLE ROW LEVEL SECURITY;

-- Staff can view their own church's staff list
DO $$ BEGIN
  CREATE POLICY "church_staff: church members only"
    ON public.church_staff FOR ALL
    USING (church_id = public.auth_church_id())
    WITH CHECK (church_id = public.auth_church_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
