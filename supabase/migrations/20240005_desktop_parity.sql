-- ============================================================
-- Migration 5: Align cloud schema with desktop app
-- Adds missing member fields, event fields, giving fields,
-- attendance, bible study, pledges, and categories tables
-- ============================================================

-- ============================================================
-- Members — add all missing fields from desktop
-- ============================================================
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS preferred_name text NOT NULL DEFAULT '';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS cell_phone text NOT NULL DEFAULT '';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT '';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS zip text NOT NULL DEFAULT '';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS join_date date;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS joined_by text NOT NULL DEFAULT '';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';

-- ============================================================
-- Events — add time and type fields
-- ============================================================
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_time text NOT NULL DEFAULT '';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'Sunday Service';

-- ============================================================
-- Giving — add payment method
-- ============================================================
ALTER TABLE public.giving ADD COLUMN IF NOT EXISTS method text NOT NULL DEFAULT '';

-- ============================================================
-- Standalone attendance (headcount-based, like desktop)
-- ============================================================
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

-- RLS for attendance
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance: church members only"
  ON public.attendance FOR ALL
  USING (church_id = public.auth_church_id())
  WITH CHECK (church_id = public.auth_church_id());

-- ============================================================
-- Pledges
-- ============================================================
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
CREATE INDEX IF NOT EXISTS idx_pledges_member ON public.pledges(member_id);

ALTER TABLE public.pledges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pledges: church members only"
  ON public.pledges FOR ALL
  USING (church_id = public.auth_church_id())
  WITH CHECK (church_id = public.auth_church_id());

-- ============================================================
-- Giving splits (split one contribution across categories)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.giving_splits (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giving_id uuid NOT NULL REFERENCES public.giving(id) ON DELETE CASCADE,
  category  text NOT NULL,
  amount    numeric(12,2) NOT NULL CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_giving_splits_giving ON public.giving_splits(giving_id);

ALTER TABLE public.giving_splits ENABLE ROW LEVEL SECURITY;
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

-- ============================================================
-- Bible study groups
-- ============================================================
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
CREATE POLICY "bible_study_groups: church members only"
  ON public.bible_study_groups FOR ALL
  USING (church_id = public.auth_church_id())
  WITH CHECK (church_id = public.auth_church_id());

-- ============================================================
-- Bible study members
-- ============================================================
CREATE TABLE IF NOT EXISTS public.bible_study_members (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  uuid NOT NULL REFERENCES public.bible_study_groups(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_bible_study_members_group ON public.bible_study_members(group_id);

ALTER TABLE public.bible_study_members ENABLE ROW LEVEL SECURITY;
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

-- ============================================================
-- Custom giving categories (church-specific)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  name      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(church_id, name)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories: church members only"
  ON public.categories FOR ALL
  USING (church_id = public.auth_church_id())
  WITH CHECK (church_id = public.auth_church_id());

-- ============================================================
-- Family members junction table (with relationship field)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.family_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'Member',
  UNIQUE(family_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_family_members_family ON public.family_members(family_id);

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
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
