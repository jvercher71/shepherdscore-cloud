-- ============================================================
-- Migration 11: Saved AI Pastoral Insights
-- Persist generated insights so pastors can review them later.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.saved_insights (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  uuid NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT '',
  payload    jsonb NOT NULL,       -- full Insights object returned by /ai/pastoral-insights
  raw        text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_insights_church_created
  ON public.saved_insights(church_id, created_at DESC);

ALTER TABLE public.saved_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved_insights: church members only"
  ON public.saved_insights FOR ALL
  USING (church_id = public.auth_church_id())
  WITH CHECK (church_id = public.auth_church_id());
