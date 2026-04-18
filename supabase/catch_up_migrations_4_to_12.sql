-- =============================================================================
-- ShepherdsCore Cloud — Catch-up Migration Bundle (migrations 4 → 12)
-- =============================================================================
-- Paste this entire file into Supabase SQL Editor and run once.
--
-- Covers schema deltas from:
--   20240004_families_extended.sql   — extended family fields
--   20240005_desktop_parity.sql      — members/events/giving extras,
--                                      attendance, pledges, giving_splits,
--                                      bible study, categories, family_members
--   20240006_logo_and_features.sql   — church logo_url
--   20240007_user_roles.sql          — church_staff table
--   20240008_fix_staff_rls.sql       — staff RLS fix
--   20240009_stripe_billing.sql      — stripe_customer_id on churches
--   20240010_event_group_locations.sql — location on events + groups
--   20240011_saved_insights.sql      — saved_insights table
--   20240012_member_role_tags.sql    — role_tags on members
--
-- Everything is idempotent: columns use IF NOT EXISTS, tables use CREATE
-- TABLE IF NOT EXISTS, policies are guarded with EXCEPTION blocks, and
-- the one renamed column is only renamed when the old name still exists.
-- =============================================================================

-- =============================================================================
-- Migration 4 — families_extended
-- =============================================================================

-- Rename name → family_name (only if not already renamed)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'families' AND column_name = 'name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'families' AND column_name = 'family_name'
  ) THEN
    ALTER TABLE public.families RENAME COLUMN name TO family_name;
  END IF;
END $$;

ALTER TABLE public.families
  ADD COLUMN IF NOT EXISTS address text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes   text NOT NULL DEFAULT '';

-- =============================================================================
-- Migration 5 — desktop_parity
-- =============================================================================

-- Members extras
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS preferred_name text NOT NULL DEFAULT '';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS cell_phone     text NOT NULL DEFAULT '';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS city           text NOT NULL DEFAULT '';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS state          text NOT NULL DEFAULT '';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS zip            text NOT NULL DEFAULT '';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS birthday       date;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS join_date      date;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS joined_by      text NOT NULL DEFAULT '';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'Active';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS notes          text NOT NULL DEFAULT '';

-- Events extras
ALTER TABLE public.events  ADD COLUMN IF NOT EXISTS event_time text NOT NULL DEFAULT '';
ALTER TABLE public.events  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'Sunday Service';

-- Giving extras
ALTER TABLE public.giving  ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT '';

-- Attendance table
CREATE TABLE IF NOT EXISTS public.attendance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  event_id     uuid REFERENCES public.events(id) ON DELETE SET NULL,
  service_type text NOT NULL DEFAULT 'Sunday Service',
  date         date NOT NULL,
  headcount    integer NOT NULL DEFAULT 0,
  notes        text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attendance_church_date ON public.attendance(church_id, date);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "attendance: church members only"
    ON public.attendance FOR ALL
    USING (church_id = public.auth_church_id())
    WITH CHECK (church_id = public.auth_church_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Pledges
CREATE TABLE IF NOT EXISTS public.pledges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  member_id  uuid REFERENCES public.members(id) ON DELETE SET NULL,
  year       integer NOT NULL,
  category   text NOT NULL,
  amount     numeric(12,2) NOT NULL CHECK (amount >= 0),
  notes      text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pledges_church_year ON public.pledges(church_id, year);
CREATE INDEX IF NOT EXISTS idx_pledges_member      ON public.pledges(member_id);
ALTER TABLE public.pledges ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "pledges: church members only"
    ON public.pledges FOR ALL
    USING (church_id = public.auth_church_id())
    WITH CHECK (church_id = public.auth_church_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Giving splits
CREATE TABLE IF NOT EXISTS public.giving_splits (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giving_id uuid NOT NULL REFERENCES public.giving(id) ON DELETE CASCADE,
  category  text NOT NULL,
  amount    numeric(12,2) NOT NULL CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_giving_splits_giving ON public.giving_splits(giving_id);
ALTER TABLE public.giving_splits ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "giving_splits: church members only"
    ON public.giving_splits FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.giving g
        WHERE g.id = giving_splits.giving_id
          AND g.church_id = public.auth_church_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.giving g
        WHERE g.id = giving_splits.giving_id
          AND g.church_id = public.auth_church_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bible study groups
CREATE TABLE IF NOT EXISTS public.bible_study_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text NOT NULL DEFAULT '',
  meeting_day  text NOT NULL DEFAULT '',
  meeting_time text NOT NULL DEFAULT '',
  location     text NOT NULL DEFAULT '',
  teacher_id   uuid REFERENCES public.members(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bible_study_groups_church ON public.bible_study_groups(church_id);
ALTER TABLE public.bible_study_groups ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "bible_study_groups: church members only"
    ON public.bible_study_groups FOR ALL
    USING (church_id = public.auth_church_id())
    WITH CHECK (church_id = public.auth_church_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bible study members
CREATE TABLE IF NOT EXISTS public.bible_study_members (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  uuid NOT NULL REFERENCES public.bible_study_groups(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_bible_study_members_group ON public.bible_study_members(group_id);
ALTER TABLE public.bible_study_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "bible_study_members: church members only"
    ON public.bible_study_members FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.bible_study_groups g
        WHERE g.id = bible_study_members.group_id
          AND g.church_id = public.auth_church_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.bible_study_groups g
        WHERE g.id = bible_study_members.group_id
          AND g.church_id = public.auth_church_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Categories
CREATE TABLE IF NOT EXISTS public.categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(church_id, name)
);
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "categories: church members only"
    ON public.categories FOR ALL
    USING (church_id = public.auth_church_id())
    WITH CHECK (church_id = public.auth_church_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Family members junction
CREATE TABLE IF NOT EXISTS public.family_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'Member',
  UNIQUE(family_id, member_id)
);
CREATE INDEX IF NOT EXISTS idx_family_members_family ON public.family_members(family_id);
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "family_members: church members only"
    ON public.family_members FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = family_members.family_id
          AND f.church_id = public.auth_church_id()
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.families f
        WHERE f.id = family_members.family_id
          AND f.church_id = public.auth_church_id()
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Migration 6 — logo_and_features
-- =============================================================================
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '';

-- =============================================================================
-- Migration 7 — user_roles (church_staff)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.church_staff (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  email        text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role         text NOT NULL DEFAULT 'View-Only',
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_login   timestamptz,
  UNIQUE(church_id, user_id),
  UNIQUE(church_id, email)
);
CREATE INDEX IF NOT EXISTS idx_church_staff_church ON public.church_staff(church_id);
CREATE INDEX IF NOT EXISTS idx_church_staff_user   ON public.church_staff(user_id);
ALTER TABLE public.church_staff ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Migration 8 — fix_staff_rls (replace policies)
-- =============================================================================
DROP POLICY IF EXISTS "church_staff: church members only"    ON public.church_staff;
DROP POLICY IF EXISTS "church_staff: admins full access"     ON public.church_staff;
DROP POLICY IF EXISTS "church_staff: members can view"       ON public.church_staff;
DROP POLICY IF EXISTS "church_staff: first user self-register" ON public.church_staff;

CREATE POLICY "church_staff: admins full access"
  ON public.church_staff FOR ALL
  USING (
    church_id = public.auth_church_id()
    AND EXISTS (
      SELECT 1 FROM public.church_staff cs
      WHERE cs.church_id = public.auth_church_id()
        AND cs.user_id = (auth.jwt() ->> 'sub')::uuid
        AND cs.role = 'Admin'
    )
  )
  WITH CHECK (
    church_id = public.auth_church_id()
    AND EXISTS (
      SELECT 1 FROM public.church_staff cs
      WHERE cs.church_id = public.auth_church_id()
        AND cs.user_id = (auth.jwt() ->> 'sub')::uuid
        AND cs.role = 'Admin'
    )
  );

CREATE POLICY "church_staff: members can view"
  ON public.church_staff FOR SELECT
  USING (church_id = public.auth_church_id());

CREATE POLICY "church_staff: first user self-register"
  ON public.church_staff FOR INSERT
  WITH CHECK (
    church_id = public.auth_church_id()
    AND user_id = (auth.jwt() ->> 'sub')::uuid
    AND NOT EXISTS (
      SELECT 1 FROM public.church_staff cs
      WHERE cs.church_id = public.auth_church_id()
    )
  );

-- =============================================================================
-- Migration 9 — stripe_billing
-- =============================================================================
ALTER TABLE public.churches ADD COLUMN IF NOT EXISTS stripe_customer_id text;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='churches' AND column_name='paddle_customer_id') THEN
    UPDATE public.churches SET stripe_customer_id = paddle_customer_id
    WHERE paddle_customer_id IS NOT NULL AND stripe_customer_id IS NULL;
    ALTER TABLE public.churches DROP COLUMN paddle_customer_id;
  END IF;
END $$;

-- =============================================================================
-- Migration 10 — event + group locations
-- =============================================================================
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS location text NOT NULL DEFAULT '';

-- =============================================================================
-- Migration 11 — saved_insights
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.saved_insights (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT '',
  payload    jsonb NOT NULL,
  raw        text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_saved_insights_church_created
  ON public.saved_insights(church_id, created_at DESC);
ALTER TABLE public.saved_insights ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "saved_insights: church members only"
    ON public.saved_insights FOR ALL
    USING (church_id = public.auth_church_id())
    WITH CHECK (church_id = public.auth_church_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Migration 12 — member role_tags
-- =============================================================================
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS role_tags text[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX IF NOT EXISTS idx_members_role_tags
  ON public.members USING gin(role_tags);

-- =============================================================================
-- Done. Run the reset + seed scripts next.
-- =============================================================================
